import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { encryptToken, decryptToken } from "./lib/encryption";
import { getAdapter } from "./platforms/registry";

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
        const result = await getAdapter(account.platform).oauth.refreshToken(refreshToken);

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
