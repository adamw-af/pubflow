import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, httpAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptToken } from "./lib/encryption";
import { getAdapter, platformValidator, type PlatformId } from "./platforms/registry";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type Platform = PlatformId;

function callbackUrlFor(platform: string): string {
  return `${process.env.CONVEX_SITE_URL}/oauth/callback/${platform}`;
}

// ---------------------------------------------------------------------------
// PKCE helpers (PKCE platforms only, e.g. X)
// ---------------------------------------------------------------------------

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = bytesToBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = bytesToBase64url(new Uint8Array(hash));
  return { verifier, challenge };
}

function randomState(): string {
  return bytesToBase64url(crypto.getRandomValues(new Uint8Array(24)));
}

// ---------------------------------------------------------------------------
// Public action — called from the frontend to get the authorization URL
// ---------------------------------------------------------------------------

export const beginOAuthFlow = action({
  args: {
    platform: platformValidator,
  },
  handler: async (ctx, { platform }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.runQuery(internal.oauth.getWorkspaceForUser, {
      tokenIdentifier: identity.subject,
    });
    if (!workspace) throw new Error("Workspace not found");

    const adapter = getAdapter(platform);
    if (adapter.auth.kind !== "oauth") {
      throw new Error(`${platform} does not use the OAuth redirect flow`);
    }
    const state = randomState();
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (adapter.auth.usesPKCE) {
      const pkce = await generatePKCE();
      codeVerifier = pkce.verifier;
      codeChallenge = pkce.challenge;
    }

    await ctx.runMutation(internal.oauth.storeOAuthState, {
      state,
      workspaceId: workspace._id,
      userTokenIdentifier: identity.subject,
      platform,
      expiresAt: Date.now() + STATE_TTL_MS,
      codeVerifier,
    });

    return adapter.auth.authUrl({
      state,
      callbackUrl: callbackUrlFor(platform),
      codeChallenge,
    });
  },
});

// ---------------------------------------------------------------------------
// Public action — connect a credential-auth Platform (e.g. Bluesky)
//
// Credential platforms have no redirect dance: the user submits credentials
// (handle + app password for Bluesky) and we exchange them for a session in one
// call, then store the account exactly like the OAuth callback does.
// ---------------------------------------------------------------------------

export const connectWithCredentials = action({
  args: {
    platform: platformValidator,
    credentials: v.record(v.string(), v.string()),
  },
  handler: async (ctx, { platform, credentials }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.runQuery(internal.oauth.getWorkspaceForUser, {
      tokenIdentifier: identity.subject,
    });
    if (!workspace) throw new Error("Workspace not found");

    const adapter = getAdapter(platform);
    if (adapter.auth.kind !== "credentials") {
      throw new Error(`${platform} connects via the OAuth redirect flow, not credentials`);
    }

    const { platformAccountId, platformUsername, accessToken, refreshToken, tokenExpiresAt } =
      await adapter.auth.connect({ credentials });

    const encryptedAccessToken = await encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? await encryptToken(refreshToken) : undefined;

    await ctx.runMutation(internal.oauth.upsertSocialAccount, {
      workspaceId: workspace._id,
      platform,
      platformAccountId,
      platformUsername,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
    });
  },
});

// ---------------------------------------------------------------------------
// HTTP action — OAuth callback (platform redirects here with ?code=&state=)
// ---------------------------------------------------------------------------

export const oauthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const platform = url.pathname.split("/").pop() as Platform;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const failureRedirect = (reason: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${frontendUrl}/dashboard/settings?oauth_error=${encodeURIComponent(reason)}` },
    });

  if (error || !code || !state) {
    return failureRedirect(error ?? "missing_code");
  }

  // Validate state
  const oauthState = await ctx.runQuery(internal.oauth.getOAuthState, { state });
  if (!oauthState) return failureRedirect("invalid_state");
  if (Date.now() > oauthState.expiresAt) {
    await ctx.runMutation(internal.oauth.deleteOAuthState, { state });
    return failureRedirect("state_expired");
  }

  try {
    const adapter = getAdapter(platform);
    if (adapter.auth.kind !== "oauth") {
      return failureRedirect("unsupported_flow");
    }
    const { platformAccountId, platformUsername, accessToken, refreshToken, tokenExpiresAt } =
      await adapter.auth.exchangeCode({
        code,
        codeVerifier: oauthState.codeVerifier,
        callbackUrl: callbackUrlFor(platform),
      });

    const encryptedAccessToken = await encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? await encryptToken(refreshToken) : undefined;

    await ctx.runMutation(internal.oauth.upsertSocialAccount, {
      workspaceId: oauthState.workspaceId,
      platform,
      platformAccountId,
      platformUsername,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
    });

    await ctx.runMutation(internal.oauth.deleteOAuthState, { state });

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${frontendUrl}/dashboard?connected=${platform}`,
      },
    });
  } catch (err) {
    console.error(`OAuth callback error for ${platform}:`, err);
    await ctx.runMutation(internal.oauth.deleteOAuthState, { state });
    return failureRedirect("token_exchange_failed");
  }
});

// ---------------------------------------------------------------------------
// Internal mutations / queries
// ---------------------------------------------------------------------------

export const getWorkspaceForUser = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!user?.workspaceId) return null;
    return ctx.db.get(user.workspaceId);
  },
});

export const storeOAuthState = internalMutation({
  args: {
    state: v.string(),
    workspaceId: v.id("workspaces"),
    userTokenIdentifier: v.string(),
    platform: platformValidator,
    expiresAt: v.number(),
    codeVerifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", args);
  },
});

export const getOAuthState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    return ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
  },
});

export const deleteOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const record = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (record) await ctx.db.delete(record._id);
  },
});

export const upsertSocialAccount = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    platform: platformValidator,
    platformAccountId: v.string(),
    platformUsername: v.string(),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("socialAccounts")
      .withIndex("by_workspace_platform", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("platform", args.platform)
      )
      .filter((q) => q.eq(q.field("platformAccountId"), args.platformAccountId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        platformUsername: args.platformUsername,
        encryptedAccessToken: args.encryptedAccessToken,
        encryptedRefreshToken: args.encryptedRefreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        status: "active",
      });
    } else {
      await ctx.db.insert("socialAccounts", {
        workspaceId: args.workspaceId,
        platform: args.platform,
        platformAccountId: args.platformAccountId,
        platformUsername: args.platformUsername,
        encryptedAccessToken: args.encryptedAccessToken,
        encryptedRefreshToken: args.encryptedRefreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        status: "active",
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Public query — list connected accounts for the current workspace
// ---------------------------------------------------------------------------

export const listSocialAccounts = action({
  handler: async (ctx): Promise<Array<{
    _id: Id<"socialAccounts">;
    workspaceId: Id<"workspaces">;
    platform: PlatformId;
    platformAccountId: string;
    platformUsername: string;
    tokenExpiresAt?: number;
    status: "active" | "expired" | "revoked";
  }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.runQuery(internal.oauth.getWorkspaceForUser, {
      tokenIdentifier: identity.subject,
    }) as { _id: Id<"workspaces"> } | null;
    if (!workspace) return [];

    return ctx.runQuery(internal.oauth.getSocialAccountsForWorkspace, {
      workspaceId: workspace._id,
    });
  },
});

export const getSocialAccountsForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const accounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    // Never return encrypted tokens to the client
    return accounts.map(({ encryptedAccessToken: _, encryptedRefreshToken: __, ...safe }) => safe);
  },
});
