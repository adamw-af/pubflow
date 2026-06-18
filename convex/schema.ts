import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { platformValidator, tiktokOptionsValidator } from "./platforms/registry";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_workspace", ["workspaceId"]),

  workspaces: defineTable({
    name: v.string(),
    ownerTokenIdentifier: v.string(),
    tier: v.union(v.literal("base"), v.literal("pro"), v.literal("premium")),
    // IANA timezone string e.g. "Europe/London", "America/New_York"
    timezone: v.string(),
    // When the value-first Trial ends (set at createWorkspace to now + 7 days).
    // Access state is derived from this + the Subscription — no separate status
    // enum. Optional for back-compat: rows created before Trials existed have no
    // value and are treated as an already-expired Trial by getWorkspaceAccess.
    trialEndsAt: v.optional(v.number()),
    onboardingCompletedAt: v.optional(v.number()),
    emailNotifications: v.optional(v.object({
      publicationFailed: v.boolean(),
    })),
  }).index("by_owner", ["ownerTokenIdentifier"]),

  subscriptions: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    // kept for backwards compat during migration
    userId: v.optional(v.string()),
    polarId: v.optional(v.string()),
    polarPriceId: v.optional(v.string()),
    currency: v.optional(v.string()),
    interval: v.optional(v.string()),
    status: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    amount: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    customerCancellationReason: v.optional(v.string()),
    customerCancellationComment: v.optional(v.string()),
    metadata: v.optional(v.any()),
    customFieldData: v.optional(v.any()),
    customerId: v.optional(v.string()),
  })
    .index("userId", ["userId"])
    .index("polarId", ["polarId"])
    .index("by_workspace", ["workspaceId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userTokenIdentifier: v.string(),
    role: v.union(v.literal("owner"), v.literal("member")),
    invitedByTokenIdentifier: v.string(),
    joinedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userTokenIdentifier"])
    .index("by_workspace_user", ["workspaceId", "userTokenIdentifier"]),

  workspaceInvites: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: v.literal("member"),
    token: v.string(),
    invitedByTokenIdentifier: v.string(),
    expiresAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_token", ["token"]),

  socialAccounts: defineTable({
    workspaceId: v.id("workspaces"),
    platform: platformValidator,
    platformAccountId: v.string(),
    platformUsername: v.string(),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("revoked")
    ),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_platform", ["workspaceId", "platform"]),

  postTemplates: defineTable({
    workspaceId: v.id("workspaces"),
    authorTokenIdentifier: v.string(),
    recurrence: v.object({
      frequency: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly")
      ),
      // weekly: 0=Sun, 1=Mon, ... 6=Sat
      daysOfWeek: v.optional(v.array(v.number())),
      // monthly: 1–28
      dayOfMonth: v.optional(v.number()),
      // "HH:MM" in workspace timezone
      timeOfDay: v.string(),
      endsAt: v.optional(v.number()),
    }),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("ended")),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_status", ["status"]),

  postTemplateVariants: defineTable({
    templateId: v.id("postTemplates"),
    socialAccountId: v.id("socialAccounts"),
    caption: v.optional(v.string()),
    mediaItemIds: v.optional(v.array(v.id("mediaItems"))),
    // TikTok privacy/disclosure settings (capability-aware variant field).
    tiktokOptions: v.optional(tiktokOptionsValidator),
  })
    .index("by_template", ["templateId"])
    .index("by_template_account", ["templateId", "socialAccountId"]),

  posts: defineTable({
    workspaceId: v.id("workspaces"),
    authorTokenIdentifier: v.string(),
    templateId: v.optional(v.id("postTemplates")),
    scheduledAt: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      // Async video publishing (ADR 0007): at least one Publication is still
      // being processed by the Platform; the Post is neither scheduled nor done.
      v.literal("publishing"),
      v.literal("published"),
      v.literal("failed"),
      v.literal("partial")
    ),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_status_scheduled", ["status", "scheduledAt"])
    .index("by_template", ["templateId"]),

  postVariants: defineTable({
    postId: v.id("posts"),
    socialAccountId: v.id("socialAccounts"),
    caption: v.optional(v.string()),
    mediaItemIds: v.optional(v.array(v.id("mediaItems"))),
    // TikTok privacy/disclosure settings (capability-aware variant field).
    tiktokOptions: v.optional(tiktokOptionsValidator),
  })
    .index("by_post", ["postId"])
    .index("by_post_account", ["postId", "socialAccountId"]),

  publications: defineTable({
    postId: v.id("posts"),
    postVariantId: v.id("postVariants"),
    socialAccountId: v.id("socialAccounts"),
    status: v.union(
      v.literal("scheduled"),
      v.literal("publishing"),
      v.literal("published"),
      v.literal("failed")
    ),
    scheduledAt: v.number(),
    publishedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    // Async video publishing (ADR 0007): when an adapter's publish() returns
    // in-progress, the Publication stays durably `publishing` with the platform
    // job/upload handle (e.g. TikTok publish_id) stored here; the poll sweep
    // reads `publishing` Publications carrying a handle and settles them.
    platformJobHandle: v.optional(v.string()),
  })
    .index("by_post", ["postId"])
    .index("by_status_scheduled", ["status", "scheduledAt"]),

  mediaItems: defineTable({
    workspaceId: v.id("workspaces"),
    uploadedByTokenIdentifier: v.string(),
    r2Key: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_created", ["workspaceId", "createdAt"]),

  oauthStates: defineTable({
    state: v.string(),
    workspaceId: v.id("workspaces"),
    userTokenIdentifier: v.string(),
    platform: platformValidator,
    expiresAt: v.number(),
    codeVerifier: v.optional(v.string()), // PKCE platforms only (e.g. X)
  }).index("by_state", ["state"]),

  hashtagSets: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    hashtags: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  aiUsage: defineTable({
    workspaceId: v.id("workspaces"),
    userTokenIdentifier: v.string(),
    type: v.literal("caption_generation"),
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"]),

  webhookEvents: defineTable({
    type: v.string(),
    polarEventId: v.string(),
    createdAt: v.string(),
    modifiedAt: v.string(),
    data: v.any(),
  })
    .index("type", ["type"])
    .index("polarEventId", ["polarEventId"]),
});
