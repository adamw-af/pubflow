import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, httpAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptToken } from "./lib/encryption";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Platform configs
// ---------------------------------------------------------------------------

type Platform = "linkedin" | "instagram" | "x";

function getAuthorizationUrl(
  platform: Platform,
  state: string,
  codeChallenge?: string
): string {
  const callbackUrl = `${process.env.CONVEX_SITE_URL}/oauth/callback/${platform}`;

  switch (platform) {
    case "linkedin":
      return (
        `https://www.linkedin.com/oauth/v2/authorization?` +
        new URLSearchParams({
          response_type: "code",
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          redirect_uri: callbackUrl,
          state,
          scope: "w_member_social openid profile email",
        })
      );

    case "instagram":
      return (
        `https://www.facebook.com/v19.0/dialog/oauth?` +
        new URLSearchParams({
          response_type: "code",
          client_id: process.env.FACEBOOK_APP_ID!,
          redirect_uri: callbackUrl,
          state,
          scope: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
        })
      );

    case "x":
      return (
        `https://twitter.com/i/oauth2/authorize?` +
        new URLSearchParams({
          response_type: "code",
          client_id: process.env.X_CLIENT_ID!,
          redirect_uri: callbackUrl,
          state,
          scope: "tweet.read tweet.write users.read offline.access",
          code_challenge: codeChallenge!,
          code_challenge_method: "S256",
        })
      );
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers (X only)
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
    platform: v.union(v.literal("linkedin"), v.literal("instagram"), v.literal("x")),
  },
  handler: async (ctx, { platform }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.runQuery(internal.oauth.getWorkspaceForUser, {
      tokenIdentifier: identity.subject,
    });
    if (!workspace) throw new Error("Workspace not found");

    const state = randomState();
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (platform === "x") {
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

    return getAuthorizationUrl(platform, state, codeChallenge);
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
    const { platformAccountId, platformUsername, accessToken, refreshToken, tokenExpiresAt } =
      await exchangeCodeForTokens(platform, code, oauthState.codeVerifier, request.url);

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
        Location: `${frontendUrl}/dashboard/settings?connected=${platform}`,
      },
    });
  } catch (err) {
    console.error(`OAuth callback error for ${platform}:`, err);
    await ctx.runMutation(internal.oauth.deleteOAuthState, { state });
    return failureRedirect("token_exchange_failed");
  }
});

// ---------------------------------------------------------------------------
// Token exchange — platform-specific
// ---------------------------------------------------------------------------

type TokenResult = {
  platformAccountId: string;
  platformUsername: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
};

async function exchangeCodeForTokens(
  platform: Platform,
  code: string,
  codeVerifier: string | undefined,
  callbackRequestUrl: string
): Promise<TokenResult> {
  switch (platform) {
    case "linkedin":
      return exchangeLinkedIn(code, callbackRequestUrl);
    case "instagram":
      return exchangeInstagram(code, callbackRequestUrl);
    case "x":
      return exchangeX(code, codeVerifier!, callbackRequestUrl);
  }
}

async function exchangeLinkedIn(code: string, callbackRequestUrl: string): Promise<TokenResult> {
  const callbackUrl = buildCallbackUrl(callbackRequestUrl, "linkedin");

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });

  if (!tokenRes.ok) throw new Error(`LinkedIn token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();

  // Fetch LinkedIn user info
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error("Failed to fetch LinkedIn profile");
  const profile = await profileRes.json();

  return {
    platformAccountId: profile.sub,
    platformUsername: profile.name ?? profile.email ?? profile.sub,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  };
}

async function exchangeInstagram(code: string, callbackRequestUrl: string): Promise<TokenResult> {
  const callbackUrl = buildCallbackUrl(callbackRequestUrl, "instagram");

  // Step 1: Short-lived FB user access token
  const tokenRes = await fetch("https://graph.facebook.com/v19.0/oauth/access_token", {
    method: "GET",
    // Facebook accepts token exchange as GET with query params
  });

  // Actually Facebook requires POST for server-side flow
  const shortTokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        redirect_uri: callbackUrl,
        code,
      })
  );
  if (!shortTokenRes.ok) throw new Error(`Instagram token exchange failed: ${await shortTokenRes.text()}`);
  const { access_token: shortToken } = await shortTokenRes.json();

  // Step 2: Exchange short-lived for long-lived token (60 days)
  const longTokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        fb_exchange_token: shortToken,
      })
  );
  if (!longTokenRes.ok) throw new Error("Failed to exchange for long-lived Instagram token");
  const { access_token: longToken, expires_in } = await longTokenRes.json();

  // Step 3: Get user's Facebook Pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`
  );
  if (!pagesRes.ok) throw new Error("Failed to fetch Facebook pages");
  const { data: pages } = await pagesRes.json();

  // Step 4: Find the Instagram Business Account linked to a page
  for (const page of pages ?? []) {
    const igRes = await fetch(
      `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );
    if (!igRes.ok) continue;
    const { instagram_business_account } = await igRes.json();
    if (!instagram_business_account) continue;

    // Get Instagram username
    const igUserRes = await fetch(
      `https://graph.facebook.com/v19.0/${instagram_business_account.id}?fields=username&access_token=${page.access_token}`
    );
    const igUser = igUserRes.ok ? await igUserRes.json() : { username: instagram_business_account.id };

    return {
      platformAccountId: instagram_business_account.id,
      platformUsername: igUser.username ?? instagram_business_account.id,
      // Store the page access token — used for Instagram Graph API calls
      accessToken: page.access_token,
      tokenExpiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
    };
  }

  throw new Error("No Instagram Business Account found. Make sure your account is a Professional account connected to a Facebook Page.");
}

async function exchangeX(code: string, codeVerifier: string, callbackRequestUrl: string): Promise<TokenResult> {
  const callbackUrl = buildCallbackUrl(callbackRequestUrl, "x");

  const credentials = btoa(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`);

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) throw new Error(`X token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();

  // Fetch X user info
  const userRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) throw new Error("Failed to fetch X user info");
  const { data: xUser } = await userRes.json();

  return {
    platformAccountId: xUser.id,
    platformUsername: xUser.username,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  };
}

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
    platform: v.union(v.literal("linkedin"), v.literal("instagram"), v.literal("x")),
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
    platform: v.union(v.literal("linkedin"), v.literal("instagram"), v.literal("x")),
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
    platform: "linkedin" | "instagram" | "x";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCallbackUrl(requestUrl: string, platform: Platform): string {
  // Reconstruct the callback URL from the Convex site URL env var
  // (requestUrl itself is the callback URL, but we use the env var to be explicit)
  return `${process.env.CONVEX_SITE_URL}/oauth/callback/${platform}`;
}
