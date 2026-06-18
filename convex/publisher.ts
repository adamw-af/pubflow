import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptToken, encryptToken } from "./lib/encryption";
import { getNextOccurrence } from "./lib/recurrence";
import { getAdapter } from "./platforms/registry";
import type { PublishResult, PublishStatusResult } from "./platforms/types";

const MAX_BATCH = 50;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
// Refresh a token at publish time if it expires within this window. Covers
// short-lived tokens (e.g. Bluesky's ~2h access JWT) that the daily refresh
// cron cannot keep alive for Posts scheduled further out.
const PUBLISH_REFRESH_BUFFER_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Publish outcomes (ADR 0007)
//
// A publish attempt settles into one of three states. `published`/`failed` are
// terminal; `in_progress` is the durable async case — the Publication stays
// `publishing` with the platform job handle stored and the cron poll sweep
// settles it later. `toOutcome` maps the three-shape PublishResult, and
// `toStatusOutcome` maps the poll result; `recordOutcome` persists either and
// notifies on failure, so the publish and poll paths share one code path.
// ---------------------------------------------------------------------------

type PublishOutcome =
  | { state: "published"; platformPostId: string }
  | { state: "in_progress"; jobHandle: string }
  | { state: "failed"; error: string };

function toOutcome(result: PublishResult): PublishOutcome {
  if (!result.success) return { state: "failed", error: result.error };
  if ("inProgress" in result) return { state: "in_progress", jobHandle: result.jobHandle };
  return { state: "published", platformPostId: result.platformPostId };
}

function toStatusOutcome(result: PublishStatusResult): PublishOutcome {
  if (result.status === "published")
    return { state: "published", platformPostId: result.platformPostId };
  if (result.status === "failed") return { state: "failed", error: result.error };
  return { state: "in_progress", jobHandle: "" };
}

async function recordOutcome(
  ctx: any,
  publicationId: Id<"publications">,
  postId: Id<"posts">,
  outcome: PublishOutcome
): Promise<void> {
  await ctx.runMutation(internal.publisher.recordPublicationResult, {
    publicationId,
    status: outcome.state === "in_progress" ? "publishing" : outcome.state,
    platformJobHandle: outcome.state === "in_progress" ? outcome.jobHandle : undefined,
    publishedAt: outcome.state === "published" ? Date.now() : undefined,
    errorMessage: outcome.state === "failed" ? outcome.error : undefined,
  });

  if (outcome.state !== "failed") return;

  const notifyData = await ctx.runQuery(internal.publisher.getNotificationData, {
    publicationId,
  });
  if (notifyData?.emailEnabled) {
    await ctx.runAction(internal.notifications.sendPublicationFailureEmail, {
      toEmail: notifyData.ownerEmail,
      workspaceName: notifyData.workspaceName,
      platform: notifyData.platform,
      platformUsername: notifyData.platformUsername,
      errorMessage: outcome.error,
      postId,
    });
  }
}

// ---------------------------------------------------------------------------
// Main action — called by the cron every minute
// ---------------------------------------------------------------------------

export const processScheduledPublications = internalAction({
  handler: async (ctx) => {
    const now = Date.now();

    // Atomically claim due publications (mutation ensures no double-publish)
    const due = await ctx.runMutation(internal.publisher.claimDuePublications, { now });

    for (const pub of due) {
      let outcome: PublishOutcome;

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
          options:
            variant.tiktokOptions || variant.youtubeOptions
              ? { tiktok: variant.tiktokOptions, youtube: variant.youtubeOptions }
              : undefined,
        });

        outcome = toOutcome(publishResult);
      } catch (err) {
        outcome = {
          state: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }

      await recordOutcome(ctx, pub._id, pub.postId, outcome);
    }

    // Roll up post statuses and schedule next occurrences for templates
    const postIds = [...new Set(due.map((p: { postId: Id<"posts"> }) => p.postId))];
    for (const postId of postIds) {
      await ctx.runMutation(internal.publisher.rollupPostStatus, { postId });
    }
  },
});

// ---------------------------------------------------------------------------
// Poll sweep — called by the cron every minute (ADR 0007)
//
// Reads Publications that are durably `publishing` with a stored platform job
// handle (the async video case), asks each adapter's checkStatus whether the
// job has settled, and transitions to published/failed. Still-processing jobs
// are left untouched for the next sweep. Posts touched here are rolled up after
// (a Post stays unsettled while any of its Publications is still publishing).
// ---------------------------------------------------------------------------

export const pollPublishingPublications = internalAction({
  handler: async (ctx) => {
    const pending = await ctx.runQuery(internal.publisher.getPublishingPublications, {});

    const touchedPosts = new Set<Id<"posts">>();

    for (const pub of pending) {
      const adapter = getAdapter(pub.socialAccount.platform);
      // Only async platforms store a handle; without checkStatus there is
      // nothing to poll, so leave it for an operator to investigate.
      if (!adapter.checkStatus) continue;

      let outcome: PublishOutcome;
      try {
        const accessToken = await ensureFreshAccessToken(ctx, pub.socialAccount);
        const status = await adapter.checkStatus({
          accessToken,
          jobHandle: pub.platformJobHandle,
          platformAccountId: pub.socialAccount.platformAccountId,
        });
        outcome = toStatusOutcome(status);
      } catch (err) {
        outcome = {
          state: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }

      // Still processing — no state change, try again next sweep.
      if (outcome.state === "in_progress") continue;

      await recordOutcome(ctx, pub.publicationId, pub.postId, outcome);
      touchedPosts.add(pub.postId);
    }

    for (const postId of touchedPosts) {
      await ctx.runMutation(internal.publisher.rollupPostStatus, { postId });
    }
  },
});

export const getPublishingPublications = internalQuery({
  handler: async (ctx) => {
    const publishing = await ctx.db
      .query("publications")
      .withIndex("by_status_scheduled", (q) => q.eq("status", "publishing"))
      .take(MAX_BATCH);

    // Only the async case carries a stored handle; a sync Publication caught
    // transiently `publishing` mid-sweep has none and must not be polled.
    const withHandle = publishing.filter((p) => p.platformJobHandle);

    const rows = [];
    for (const pub of withHandle) {
      const socialAccount = await ctx.db.get(pub.socialAccountId);
      if (!socialAccount) continue;
      rows.push({
        publicationId: pub._id,
        postId: pub.postId,
        platformJobHandle: pub.platformJobHandle!,
        socialAccount: {
          _id: socialAccount._id,
          platform: socialAccount.platform,
          platformAccountId: socialAccount.platformAccountId,
          encryptedAccessToken: socialAccount.encryptedAccessToken,
          encryptedRefreshToken: socialAccount.encryptedRefreshToken,
          tokenExpiresAt: socialAccount.tokenExpiresAt,
        },
      });
    }
    return rows;
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
    // `publishing` is the durable async case (ADR 0007): the handle is stored
    // and the poll sweep settles it later to `published`/`failed`.
    status: v.union(
      v.literal("publishing"),
      v.literal("published"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    platformJobHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.publicationId, {
      status: args.status,
      publishedAt: args.publishedAt,
      errorMessage: args.errorMessage,
      platformJobHandle: args.platformJobHandle,
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

    // A Post that still has a Publication waiting to start (scheduled) is left
    // as-is. Once all have started, if any is still being processed by its
    // Platform (durable `publishing`, ADR 0007) the Post reflects that
    // in-progress state; only when every Publication has settled does the Post
    // roll up to published/failed/partial.
    if (publications.some((p) => p.status === "scheduled")) return;
    if (publications.some((p) => p.status === "publishing")) {
      await ctx.db.patch(postId, { status: "publishing" });
      return;
    }

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
      tiktokOptions: tv.tiktokOptions,
      youtubeOptions: tv.youtubeOptions,
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
