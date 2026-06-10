import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const variantArg = v.object({
  socialAccountId: v.id("socialAccounts"),
  caption: v.optional(v.string()),
  mediaItemIds: v.optional(v.array(v.id("mediaItems"))),
});

async function getAuthorizedWorkspace(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q: any) => q.eq("tokenIdentifier", identity.subject))
    .unique();
  if (!user?.workspaceId) throw new Error("Workspace not found");

  return { user, workspaceId: user.workspaceId };
}

export const createPost = mutation({
  args: {
    scheduledAt: v.optional(v.number()),
    variants: v.array(variantArg),
  },
  handler: async (ctx, args) => {
    const { user, workspaceId } = await getAuthorizedWorkspace(ctx);

    const isDraft = args.scheduledAt === undefined;
    const status = isDraft ? "draft" : "scheduled";

    const postId = await ctx.db.insert("posts", {
      workspaceId,
      authorTokenIdentifier: user.tokenIdentifier,
      scheduledAt: args.scheduledAt,
      status,
      createdAt: Date.now(),
    });

    for (const variant of args.variants) {
      const variantId = await ctx.db.insert("postVariants", {
        postId,
        socialAccountId: variant.socialAccountId,
        caption: variant.caption,
        mediaItemIds: variant.mediaItemIds,
      });

      if (!isDraft && args.scheduledAt) {
        await ctx.db.insert("publications", {
          postId,
          postVariantId: variantId,
          socialAccountId: variant.socialAccountId,
          status: "scheduled",
          scheduledAt: args.scheduledAt,
        });
      }
    }

    return postId;
  },
});

export const updatePost = mutation({
  args: {
    postId: v.id("posts"),
    scheduledAt: v.optional(v.number()),
    variants: v.array(variantArg),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await getAuthorizedWorkspace(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post || post.workspaceId !== workspaceId) throw new Error("Post not found");
    if (post.status !== "draft" && post.status !== "scheduled") {
      throw new Error("Only draft or scheduled posts can be edited");
    }

    const isDraft = args.scheduledAt === undefined;
    const status = isDraft ? "draft" : "scheduled";

    await ctx.db.patch(args.postId, {
      scheduledAt: args.scheduledAt,
      status,
    });

    // Delete existing variants + publications and recreate
    const existingVariants = await ctx.db
      .query("postVariants")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const v of existingVariants) {
      const pubs = await ctx.db
        .query("publications")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .collect();
      for (const p of pubs) await ctx.db.delete(p._id);
      await ctx.db.delete(v._id);
    }

    for (const variant of args.variants) {
      const variantId = await ctx.db.insert("postVariants", {
        postId: args.postId,
        socialAccountId: variant.socialAccountId,
        caption: variant.caption,
        mediaItemIds: variant.mediaItemIds,
      });

      if (!isDraft && args.scheduledAt) {
        await ctx.db.insert("publications", {
          postId: args.postId,
          postVariantId: variantId,
          socialAccountId: variant.socialAccountId,
          status: "scheduled",
          scheduledAt: args.scheduledAt,
        });
      }
    }
  },
});

export const deleteDraft = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const { workspaceId } = await getAuthorizedWorkspace(ctx);
    const post = await ctx.db.get(postId);
    if (!post || post.workspaceId !== workspaceId) throw new Error("Post not found");
    if (post.status !== "draft") throw new Error("Only drafts can be deleted this way");
    await ctx.db.delete(postId);
  },
});

export const listPostsForCurrentWorkspace = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("scheduled"),
        v.literal("published"),
        v.literal("failed"),
        v.literal("partial")
      )
    ),
  },
  handler: async (ctx, { status }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) return [];

    const base = ctx.db
      .query("posts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", user.workspaceId!));

    const posts = await (status
      ? ctx.db
          .query("posts")
          .withIndex("by_workspace_status", (q) =>
            q.eq("workspaceId", user.workspaceId!).eq("status", status)
          )
          .collect()
      : base.collect());

    return posts.sort((a, b) => (a.scheduledAt ?? a.createdAt) - (b.scheduledAt ?? b.createdAt));
  },
});

export const getPostWithVariants = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();
    if (!user?.workspaceId) return null;

    const post = await ctx.db.get(postId);
    if (!post || post.workspaceId !== user.workspaceId) return null;

    const variants = await ctx.db
      .query("postVariants")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    return { post, variants };
  },
});
