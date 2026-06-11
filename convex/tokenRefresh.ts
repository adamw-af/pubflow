import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { encryptToken, decryptToken } from "./lib/encryption";

const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days before expiry

export const refreshExpiringTokens = internalAction({
  handler: async (ctx) => {
    const soon = Date.now() + REFRESH_WINDOW_MS;

    const accounts = await ctx.runQuery(internal.tokenRefresh.getExpiringAccounts, { before: soon });

    for (const account of accounts) {
      if (!account.encryptedRefreshToken) {
        // No refresh token — mark expired so user knows to reconnect
        await ctx.runMutation(internal.tokenRefresh.markExpired, { id: account._id });
        continue;
      }

      try {
        const refreshToken = await decryptToken(account.encryptedRefreshToken);
        const result = await refreshPlatformToken(account.platform, refreshToken);

        const encryptedAccessToken = await encryptToken(result.accessToken);
        const encryptedRefreshToken = result.refreshToken
          ? await encryptToken(result.refreshToken)
          : account.encryptedRefreshToken; // keep existing if not rotated

        await ctx.runMutation(internal.tokenRefresh.storeRefreshedToken, {
          id: account._id,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt: result.expiresAt,
        });
      } catch (err) {
        console.error(`Token refresh failed for ${account._id}:`, err);
        await ctx.runMutation(internal.tokenRefresh.markExpired, { id: account._id });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Platform-specific refresh
// ---------------------------------------------------------------------------

type RefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

async function refreshPlatformToken(
  platform: "linkedin" | "instagram" | "x",
  refreshToken: string
): Promise<RefreshResult> {
  switch (platform) {
    case "linkedin":
      return refreshLinkedIn(refreshToken);
    case "x":
      return refreshX(refreshToken);
    case "instagram":
      return refreshInstagram(refreshToken);
  }
}

async function refreshLinkedIn(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

async function refreshX(refreshToken: string): Promise<RefreshResult> {
  const credentials = btoa(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`);
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`X refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

async function refreshInstagram(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?` +
      new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: refreshToken,
      })
  );
  if (!res.ok) throw new Error(`Instagram refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal queries / mutations
// ---------------------------------------------------------------------------

export const getExpiringAccounts = internalQuery({
  args: { before: v.number() },
  handler: async (ctx, { before }) => {
    // Get active accounts whose token expires within the window (or already expired)
    const all = await ctx.db
      .query("socialAccounts")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return all.filter(
      (a) => a.tokenExpiresAt !== undefined && a.tokenExpiresAt <= before
    );
  },
});

export const storeRefreshedToken = internalMutation({
  args: {
    id: v.id("socialAccounts"),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, encryptedAccessToken, encryptedRefreshToken, tokenExpiresAt }) => {
    await ctx.db.patch(id, {
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      status: "active",
    });
  },
});

export const markExpired = internalMutation({
  args: { id: v.id("socialAccounts") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "expired" });
  },
});
