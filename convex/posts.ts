import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getPlatformMetadata } from "./platforms/registry";
import {
  validateAgainstCapability,
  type CapabilityError,
} from "./platforms/capabilityValidation";

const variantArg = v.object({
  socialAccountId: v.id("socialAccounts"),
  caption: v.optional(v.string()),
  mediaItemIds: v.optional(v.array(v.id("mediaItems"))),
});

type VariantArg = {
  socialAccountId: Id<"socialAccounts">;
  caption?: string;
  mediaItemIds?: Id<"mediaItems">[];
};

/**
 * Validate one variant against its target Social Account's Platform Capability.
 * Resolves the account (scoped to the workspace), loads its media so the rules
 * can see image/video, and runs the single canonical validator. Returns the
 * errors plus the platform so callers can render them against the right target.
 * Both the inline composer check and the schedule-time gate go through here, so
 * they can never disagree.
 */
async function validateVariant(
  ctx: any,
  workspaceId: Id<"workspaces">,
  variant: VariantArg
): Promise<{ platform: string; errors: CapabilityError[] }> {
  const account = await ctx.db.get(variant.socialAccountId);
  if (!account || account.workspaceId !== workspaceId) {
    throw new Error("Social account not found");
  }

  const media: { isVideo: boolean }[] = [];
  for (const id of variant.mediaItemIds ?? []) {
    const item = await ctx.db.get(id);
    if (item) media.push({ isVideo: item.mimeType.startsWith("video/") });
  }

  const capability = getPlatformMetadata(account.platform).capability;
  const errors = validateAgainstCapability(capability, {
    caption: variant.caption ?? "",
    media,
  });

  return { platform: account.platform, errors };
}

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

export const validateComposition = query({
  args: { variants: v.array(variantArg) },
  handler: async (ctx, { variants }) => {
    const { workspaceId } = await getAuthorizedWorkspace(ctx);

    const results = [];
    for (const variant of variants) {
      const { platform, errors } = await validateVariant(ctx, workspaceId, variant);
      results.push({
        socialAccountId: variant.socialAccountId,
        platform,
        errors,
      });
    }
    return results;
  },
});

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

    const scheduled = await insertVariantsAndPublications(
      ctx,
      workspaceId,
      postId,
      args.variants,
      isDraft ? undefined : args.scheduledAt
    );

    // Drafts can hold invalid content; a schedule must produce at least one
    // Publication, but one blocked Platform never blocks the valid ones (AC#4).
    if (!isDraft && scheduled === 0) {
      throw new Error("No selected platform can publish this post as composed");
    }

    return postId;
  },
});

/**
 * Create the Post Variant rows and, when scheduling, a Publication per variant
 * that satisfies its target's Platform Capability. Invalid variants are still
 * stored (their content is preserved) but get no Publication, so a blocked
 * Platform never holds up the valid ones. Returns the count of Publications
 * created. Pass `scheduledAt: undefined` to store variants only (draft).
 */
async function insertVariantsAndPublications(
  ctx: any,
  workspaceId: Id<"workspaces">,
  postId: Id<"posts">,
  variants: VariantArg[],
  scheduledAt: number | undefined
): Promise<number> {
  let scheduled = 0;
  for (const variant of variants) {
    const variantId = await ctx.db.insert("postVariants", {
      postId,
      socialAccountId: variant.socialAccountId,
      caption: variant.caption,
      mediaItemIds: variant.mediaItemIds,
    });

    if (scheduledAt === undefined) continue;

    const { errors } = await validateVariant(ctx, workspaceId, variant);
    if (errors.length > 0) continue;

    await ctx.db.insert("publications", {
      postId,
      postVariantId: variantId,
      socialAccountId: variant.socialAccountId,
      status: "scheduled",
      scheduledAt,
    });
    scheduled++;
  }
  return scheduled;
}

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
    const existingPubs = await ctx.db
      .query("publications")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    for (const p of existingPubs) await ctx.db.delete(p._id);
    for (const v of existingVariants) await ctx.db.delete(v._id);

    const scheduled = await insertVariantsAndPublications(
      ctx,
      workspaceId,
      args.postId,
      args.variants,
      isDraft ? undefined : args.scheduledAt
    );

    if (!isDraft && scheduled === 0) {
      throw new Error("No selected platform can publish this post as composed");
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
