import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const findUserByToken = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
  },
});

export const upsertUser = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Ensure a personal Workspace exists for this user
    let workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) =>
        q.eq("ownerTokenIdentifier", identity.subject)
      )
      .first();

    if (!workspace) {
      const name = identity.name ?? identity.email ?? "My Workspace";
      const workspaceId = await ctx.db.insert("workspaces", {
        name,
        ownerTokenIdentifier: identity.subject,
        tier: "base",
        timezone: "UTC",
      });
      workspace = await ctx.db.get(workspaceId);
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (existingUser) {
      if (
        existingUser.name !== identity.name ||
        existingUser.email !== identity.email
      ) {
        await ctx.db.patch(existingUser._id, {
          name: identity.name,
          email: identity.email,
          workspaceId: workspace!._id,
        });
      }
      return existingUser;
    }

    const userId = await ctx.db.insert("users", {
      name: identity.name,
      email: identity.email,
      tokenIdentifier: identity.subject,
      workspaceId: workspace!._id,
    });

    return await ctx.db.get(userId);
  },
});
