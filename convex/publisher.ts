import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptToken, encryptToken } from "./lib/encryption";
import { getNextOccurrence } from "./lib/recurrence";
import { getAdapter } from "./platforms/registry";

const MAX_BATCH = 50;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
// Refresh a token at publish time if it expires within this window. Covers
// short-lived tokens (e.g. Bluesky's ~2h access JWT) that the daily refresh
// cron cannot keep alive for Posts scheduled further out.
const PUBLISH_REFRESH_BUFFER_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Main action — called by the cron every minute
// ---------------------------------------------------------------------------

export const processScheduledPublications = internalAction({
  handler: async (ctx) => {
    const now = Date.now();

    // Atomically claim due publications (mutation ensures no double-publish)
    const due = await ctx.runMutation(internal.publisher.claimDuePublications, { now });

    for (const pub of due) {
      let result: { success: boolean; platformPostId?: string; error?: string };

      try {
        // Fetch variant + social account + media
        const data = await ctx.runQuery(internal.publisher.getPublicationData, {
          publicationId: pub._id,
        });

        if (!data) throw new Error("Publication data not found");

        const { variant, socialAccount } = data;

        const accessToken = await ensureFreshAccessToken(ctx, socialAccount);

        const mediaUrls = data.mediaKeys.map(
          (key: string) => `${R2_PUBLIC_URL}/${key}`
        );

        const publishResult = await getAdapter(socialAccount.platform).publish({
          accessToken,
          caption: variant.caption ?? "",
          mediaUrls,
          platformAccountId: socialAccount.platformAccountId,
        });

        result = publishResult.success
          ? { success: true, platformPostId: publishResult.platformPostId }
          : { success: false, error: publishResult.error };
      } catch (err) {
        result = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      await ctx.runMutation(internal.publisher.recordPublicationResult, {
        publicationId: pub._id,
        postId: pub.postId,
        success: result.success,
        errorMessage: result.error,
        publishedAt: result.success ? Date.now() : undefined,
      });

      // Send failure notification email if enabled
      if (!result.success) {
        const notifyData = await ctx.runQuery(internal.publisher.getNotificationData, {
          publicationId: pub._id,
        });
        if (notifyData?.emailEnabled) {
          await ctx.runAction(internal.notifications.sendPublicationFailureEmail, {
            toEmail: notifyData.ownerEmail,
            workspaceName: notifyData.workspaceName,
            platform: notifyData.platform,
            platformUsername: notifyData.platformUsername,
            errorMessage: result.error ?? "Unknown error",
            postId: pub.postId,
          });
        }
      }
    }

    // Roll up post statuses and schedule next occurrences for templates
    const postIds = [...new Set(due.map((p: { postId: Id<"posts"> }) => p.postId))];
    for (const postId of postIds) {
      await ctx.runMutation(internal.publisher.rollupPostStatus, { postId });
    }
  },
});

// ---------------------------------------------------------------------------
// Just-in-time token refresh
//
// A scheduled Publication may fire long after its Social Account's access token
// was minted. For Platforms with short-lived tokens this would fail; so if the
// token is expired (or about to be) and a refresh token exists, refresh via the
// adapter and persist the rotated tokens before publishing.
// ---------------------------------------------------------------------------

async function ensureFreshAccessToken(
  ctx: any,
  socialAccount: {
    _id: Id<"socialAccounts">;
    platform: string;
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt?: number;
  }
): Promise<string> {
  const expiringSoon =
    socialAccount.tokenExpiresAt !== undefined &&
    socialAccount.tokenExpiresAt <= Date.now() + PUBLISH_REFRESH_BUFFER_MS;

  if (!expiringSoon || !socialAccount.encryptedRefreshToken) {
    return decryptToken(socialAccount.encryptedAccessToken);
  }

  const refreshToken = await decryptToken(socialAccount.encryptedRefreshToken);
  const refreshed = await getAdapter(socialAccount.platform).auth.refreshToken(refreshToken);

  await ctx.runMutation(internal.tokenRefresh.storeRefreshedToken, {
    id: socialAccount._id,
    encryptedAccessToken: await encryptToken(refreshed.accessToken),
    encryptedRefreshToken: refreshed.refreshToken
      ? await encryptToken(refreshed.refreshToken)
      : socialAccount.encryptedRefreshToken,
    tokenExpiresAt: refreshed.expiresAt,
  });

  return refreshed.accessToken;
}

// ---------------------------------------------------------------------------
// Internal mutations
// ---------------------------------------------------------------------------

export const claimDuePublications = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const due = await ctx.db
      .query("publications")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "scheduled").lte("scheduledAt", now)
      )
      .take(MAX_BATCH);

    for (const pub of due) {
      await ctx.db.patch(pub._id, { status: "publishing" });
    }

    return due;
  },
});

export const recordPublicationResult = internalMutation({
  args: {
    publicationId: v.id("publications"),
    postId: v.id("posts"),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.publicationId, {
      status: args.success ? "published" : "failed",
      publishedAt: args.publishedAt,
      errorMessage: args.errorMessage,
    });
  },
});

export const rollupPostStatus = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const publications = await ctx.db
      .query("publications")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    // Only roll up once all publications have settled (none still publishing/scheduled)
    const unsettled = publications.filter(
      (p) => p.status === "scheduled" || p.status === "publishing"
    );
    if (unsettled.length > 0) return;

    const allPublished = publications.every((p) => p.status === "published");
    const allFailed = publications.every((p) => p.status === "failed");

    const newStatus = allPublished ? "published" : allFailed ? "failed" : "partial";
    await ctx.db.patch(postId, { status: newStatus });

    // If this post came from a template and succeeded (fully or partially), schedule next
    if (newStatus !== "failed") {
      const post = await ctx.db.get(postId);
      if (post?.templateId) {
        await scheduleNextFromTemplate(ctx, post.templateId, post.workspaceId);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Internal query
// ---------------------------------------------------------------------------

export const getNotificationData = internalQuery({
  args: { publicationId: v.id("publications") },
  handler: async (ctx, { publicationId }) => {
    const publication = await ctx.db.get(publicationId);
    if (!publication) return null;

    const socialAccount = await ctx.db.get(publication.socialAccountId);
    if (!socialAccount) return null;

    const workspace = await ctx.db.get(socialAccount.workspaceId);
    if (!workspace) return null;

    const emailEnabled = workspace.emailNotifications?.publicationFailed ?? true;
    if (!emailEnabled) return null;

    const owner = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", workspace.ownerTokenIdentifier)
      )
      .unique();
    if (!owner?.email) return null;

    return {
      emailEnabled: true,
      ownerEmail: owner.email,
      workspaceName: workspace.name,
      platform: socialAccount.platform,
      platformUsername: socialAccount.platformUsername,
    };
  },
});

export const getPublicationData = internalQuery({
  args: { publicationId: v.id("publications") },
  handler: async (ctx, { publicationId }) => {
    const publication = await ctx.db.get(publicationId);
    if (!publication) return null;

    const variant = await ctx.db.get(publication.postVariantId);
    if (!variant) return null;

    const socialAccount = await ctx.db.get(publication.socialAccountId);
    if (!socialAccount) return null;

    const mediaKeys: string[] = [];
    for (const id of variant.mediaItemIds ?? []) {
      const item = await ctx.db.get(id);
      if (item?.r2Key) mediaKeys.push(item.r2Key);
    }

    return { publication, variant, socialAccount, mediaKeys };
  },
});

// ---------------------------------------------------------------------------
// Recurrence helper (called inside rollupPostStatus mutation)
// ---------------------------------------------------------------------------

async function scheduleNextFromTemplate(
  ctx: any,
  templateId: any,
  workspaceId: any
) {
  const template = await ctx.db.get(templateId);
  if (!template || template.status !== "active") return;

  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) return;

  const nextScheduledAt = getNextOccurrence(
    template.recurrence,
    workspace.timezone,
    Date.now()
  );

  if (!nextScheduledAt) {
    // Rule has ended
    await ctx.db.patch(templateId, { status: "ended" });
    return;
  }

  // Get template variants to copy
  const templateVariants = await ctx.db
    .query("postTemplateVariants")
    .withIndex("by_template", (q: any) => q.eq("templateId", templateId))
    .collect();

  if (templateVariants.length === 0) return;

  // Create the next Post
  const nextPostId = await ctx.db.insert("posts", {
    workspaceId,
    authorTokenIdentifier: template.authorTokenIdentifier,
    templateId,
    scheduledAt: nextScheduledAt,
    status: "scheduled",
    createdAt: Date.now(),
  });

  // Copy variants and create publications
  for (const tv of templateVariants) {
    const variantId = await ctx.db.insert("postVariants", {
      postId: nextPostId,
      socialAccountId: tv.socialAccountId,
      caption: tv.caption,
      mediaItemIds: tv.mediaItemIds,
    });

    await ctx.db.insert("publications", {
      postId: nextPostId,
      postVariantId: variantId,
      socialAccountId: tv.socialAccountId,
      status: "scheduled",
      scheduledAt: nextScheduledAt,
    });
  }
}
