import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForCurrentWorkspace = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) return [];

    const accounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", user.workspaceId!))
      .collect();

    return accounts.map(({ encryptedAccessToken: _, encryptedRefreshToken: __, ...safe }) => safe);
  },
});

export const listHashtagSetsForCurrentWorkspace = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) return [];

    return ctx.db
      .query("hashtagSets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", user.workspaceId!))
      .collect();
  },
});

export const disconnectSocialAccount = mutation({
  args: { socialAccountId: v.id("socialAccounts") },
  handler: async (ctx, { socialAccountId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) throw new Error("Workspace not found");

    const account = await ctx.db.get(socialAccountId);
    if (!account || account.workspaceId !== user.workspaceId) {
      throw new Error("Social account not found");
    }

    await ctx.db.patch(socialAccountId, { status: "revoked" });
  },
});
