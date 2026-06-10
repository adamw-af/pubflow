import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getMyWorkspace = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) =>
        q.eq("ownerTokenIdentifier", identity.subject)
      )
      .first();
  },
});

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Idempotent — return existing workspace if already created
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) =>
        q.eq("ownerTokenIdentifier", identity.subject)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("workspaces", {
      name: args.name,
      ownerTokenIdentifier: identity.subject,
      tier: "base",
      timezone: args.timezone,
    });
  },
});

export const completeOnboarding = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) =>
        q.eq("ownerTokenIdentifier", identity.subject)
      )
      .first();
    if (!workspace) throw new Error("Workspace not found");

    await ctx.db.patch(workspace._id, { onboardingCompletedAt: Date.now() });
  },
});

export const updateWorkspace = mutation({
  args: {
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
    emailNotifications: v.optional(
      v.object({ publicationFailed: v.boolean() })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) =>
        q.eq("ownerTokenIdentifier", identity.subject)
      )
      .first();
    if (!workspace) throw new Error("Workspace not found");

    const patch: Record<string, any> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.emailNotifications !== undefined)
      patch.emailNotifications = args.emailNotifications;

    await ctx.db.patch(workspace._id, patch);
  },
});

export const getWorkspaceSocialAccountCount = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("socialAccounts")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .collect();
    return accounts.length;
  },
});
