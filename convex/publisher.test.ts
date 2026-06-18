/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { encryptToken } from "./lib/encryption";
import { installFetchStub, jsonResponse, type RecordedCall } from "./platforms/fetchStub";

const modules = import.meta.glob("./**/*.ts");

let restore: () => void = () => {};
afterEach(() => restore());

async function seedDueBlueskyPublication(
  t: ReturnType<typeof convexTest>,
  opts: { tokenExpiresAt?: number }
) {
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerTokenIdentifier: "user|1",
      tier: "base",
      timezone: "UTC",
    });
    const socialAccountId = await ctx.db.insert("socialAccounts", {
      workspaceId,
      platform: "bluesky",
      platformAccountId: "did:plc:abc",
      platformUsername: "adam.bsky.social",
      encryptedAccessToken: await encryptToken("stale-access"),
      encryptedRefreshToken: await encryptToken("refresh-1"),
      tokenExpiresAt: opts.tokenExpiresAt,
      status: "active",
    });
    const postId = await ctx.db.insert("posts", {
      workspaceId,
      authorTokenIdentifier: "user|1",
      scheduledAt: Date.now() - 1000,
      status: "scheduled",
      createdAt: Date.now(),
    });
    const variantId = await ctx.db.insert("postVariants", {
      postId,
      socialAccountId,
      caption: "scheduled hello",
    });
    const publicationId = await ctx.db.insert("publications", {
      postId,
      postVariantId: variantId,
      socialAccountId,
      status: "scheduled",
      scheduledAt: Date.now() - 1000,
    });
    return { socialAccountId, postId, publicationId };
  });
}

// ---------------------------------------------------------------------------
// Async video publishing state machine (ADR 0007)
//
// TikTok's publish() only initiates the upload, so a due video Publication
// settles in two phases: processScheduledPublications drives it to a durable
// `publishing` state with the platform job handle stored, then a later
// pollPublishingPublications sweep transitions it to published/failed. The Post
// must not roll up while any Publication is still `publishing`.
// ---------------------------------------------------------------------------

async function seedTikTokWorkspace(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerTokenIdentifier: "user|1",
      tier: "base",
      timezone: "UTC",
    });
    const socialAccountId = await ctx.db.insert("socialAccounts", {
      workspaceId,
      platform: "tiktok",
      platformAccountId: "open_id_1",
      platformUsername: "creator",
      encryptedAccessToken: await encryptToken("tk-access"),
      tokenExpiresAt: Date.now() + 60 * 60 * 1000, // valid, no refresh
      status: "active",
    });
    const videoId = await ctx.db.insert("mediaItems", {
      workspaceId,
      uploadedByTokenIdentifier: "user|1",
      r2Key: "media/user1/clip.mp4",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: 1234,
      createdAt: Date.now(),
    });
    return { workspaceId, socialAccountId, videoId };
  });
}

async function seedDueTikTokPublication(t: ReturnType<typeof convexTest>) {
  const { workspaceId, socialAccountId, videoId } = await seedTikTokWorkspace(t);
  return await t.run(async (ctx) => {
    const postId = await ctx.db.insert("posts", {
      workspaceId,
      authorTokenIdentifier: "user|1",
      scheduledAt: Date.now() - 1000,
      status: "scheduled",
      createdAt: Date.now(),
    });
    const variantId = await ctx.db.insert("postVariants", {
      postId,
      socialAccountId,
      caption: "my clip",
      mediaItemIds: [videoId],
      tiktokOptions: { privacyLevel: "SELF_ONLY", disclosureEnabled: false },
    });
    const publicationId = await ctx.db.insert("publications", {
      postId,
      postVariantId: variantId,
      socialAccountId,
      status: "scheduled",
      scheduledAt: Date.now() - 1000,
    });
    return { workspaceId, socialAccountId, postId, publicationId };
  });
}

/** Seed a TikTok Publication already in the durable `publishing` state. */
async function seedPublishingTikTokPublication(
  t: ReturnType<typeof convexTest>,
  jobHandle: string
) {
  const { workspaceId, socialAccountId } = await seedTikTokWorkspace(t);
  return await t.run(async (ctx) => {
    const postId = await ctx.db.insert("posts", {
      workspaceId,
      authorTokenIdentifier: "user|1",
      scheduledAt: Date.now() - 1000,
      // The publish sweep already moved this Post to the in-progress state.
      status: "publishing",
      createdAt: Date.now(),
    });
    const variantId = await ctx.db.insert("postVariants", {
      postId,
      socialAccountId,
      caption: "my clip",
    });
    const publicationId = await ctx.db.insert("publications", {
      postId,
      postVariantId: variantId,
      socialAccountId,
      status: "publishing",
      scheduledAt: Date.now() - 1000,
      platformJobHandle: jobHandle,
    });
    return { workspaceId, socialAccountId, postId, publicationId };
  });
}

describe("processScheduledPublications — async (TikTok) initiation", () => {
  it("keeps the Publication durably `publishing` with the job handle when publish() is in-progress", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const { postId, publicationId } = await seedDueTikTokPublication(t);

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/post/publish/video/init/"),
        respond: () => jsonResponse({ data: { publish_id: "pub_42" }, error: { code: "ok" } }),
      },
    ]));

    await t.action(internal.publisher.processScheduledPublications, {});

    const pub = await t.run(async (ctx) =>
      ctx.db.get(publicationId as Id<"publications">)
    );
    // Durable publishing state with the handle stored — not published/failed.
    expect(pub?.status).toBe("publishing");
    expect(pub?.platformJobHandle).toBe("pub_42");
    expect(pub?.publishedAt).toBeUndefined();

    // The Post must not settle (published/failed/partial) while a Publication is
    // still publishing — it shows the in-progress `publishing` state instead.
    const post = await t.run(async (ctx) => ctx.db.get(postId as Id<"posts">));
    expect(post?.status).toBe("publishing");
  });
});

describe("pollPublishingPublications — settling async (TikTok) Publications", () => {
  it("transitions a finished job to published and rolls the Post up to published", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const { postId, publicationId } = await seedPublishingTikTokPublication(t, "pub_42");

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/post/publish/status/fetch/"),
        respond: () =>
          jsonResponse({
            data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["9001"] },
            error: { code: "ok" },
          }),
      },
    ]));

    await t.action(internal.publisher.pollPublishingPublications, {});

    const pub = await t.run(async (ctx) => ctx.db.get(publicationId as Id<"publications">));
    expect(pub?.status).toBe("published");
    expect(pub?.publishedAt).toBeGreaterThan(0);

    const post = await t.run(async (ctx) => ctx.db.get(postId as Id<"posts">));
    expect(post?.status).toBe("published");
  });

  it("transitions a rejected video to failed with the platform's reason (for manual retry)", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const { postId, publicationId } = await seedPublishingTikTokPublication(t, "pub_42");

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/status/fetch/"),
        respond: () =>
          jsonResponse({
            data: { status: "FAILED", fail_reason: "video_duration_too_long" },
            error: { code: "ok" },
          }),
      },
    ]));

    await t.action(internal.publisher.pollPublishingPublications, {});

    const pub = await t.run(async (ctx) => ctx.db.get(publicationId as Id<"publications">));
    expect(pub?.status).toBe("failed");
    expect(pub?.errorMessage).toContain("video_duration_too_long");

    const post = await t.run(async (ctx) => ctx.db.get(postId as Id<"posts">));
    expect(post?.status).toBe("failed");
  });

  it("leaves a still-processing job in `publishing` (no transition, no rollup)", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const { postId, publicationId } = await seedPublishingTikTokPublication(t, "pub_42");

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/status/fetch/"),
        respond: () =>
          jsonResponse({ data: { status: "PROCESSING_UPLOAD" }, error: { code: "ok" } }),
      },
    ]));

    await t.action(internal.publisher.pollPublishingPublications, {});

    const pub = await t.run(async (ctx) => ctx.db.get(publicationId as Id<"publications">));
    expect(pub?.status).toBe("publishing");

    const post = await t.run(async (ctx) => ctx.db.get(postId as Id<"posts">));
    expect(post?.status).toBe("publishing");
  });

  it("derives a `partial` Post status when one Publication published and the late video failed", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const { workspaceId, socialAccountId, postId, publicationId } =
      await seedPublishingTikTokPublication(t, "pub_42");

    // Add a second, already-published Publication to the same Post (e.g. a sync
    // platform that settled during the publish sweep). The video Publication is
    // still publishing, so the Post has not rolled up yet.
    await t.run(async (ctx) => {
      const otherAccount = await ctx.db.insert("socialAccounts", {
        workspaceId,
        platform: "bluesky",
        platformAccountId: "did:plc:other",
        platformUsername: "adam.bsky.social",
        encryptedAccessToken: await encryptToken("x"),
        status: "active",
      });
      const variantId = await ctx.db.insert("postVariants", {
        postId,
        socialAccountId: otherAccount,
        caption: "text post",
      });
      await ctx.db.insert("publications", {
        postId,
        postVariantId: variantId,
        socialAccountId: otherAccount,
        status: "published",
        scheduledAt: Date.now() - 1000,
        publishedAt: Date.now() - 500,
      });
    });

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/status/fetch/"),
        respond: () =>
          jsonResponse({
            data: { status: "FAILED", fail_reason: "bad_aspect_ratio" },
            error: { code: "ok" },
          }),
      },
    ]));

    await t.action(internal.publisher.pollPublishingPublications, {});

    const tiktokPub = await t.run(async (ctx) =>
      ctx.db.get(publicationId as Id<"publications">)
    );
    expect(tiktokPub?.status).toBe("failed");

    // One published + one failed → the Post rolls up to `partial`.
    const post = await t.run(async (ctx) => ctx.db.get(postId as Id<"posts">));
    expect(post?.status).toBe("partial");
    void socialAccountId;
  });
});

describe("processScheduledPublications — just-in-time token refresh", () => {
  it("refreshes an expired token before publishing and publishes with the fresh token", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const { socialAccountId, publicationId } = await seedDueBlueskyPublication(t, {
      tokenExpiresAt: Date.now() - 60_000, // already expired
    });

    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.server.refreshSession"),
        respond: () => jsonResponse({ accessJwt: "fresh-access", refreshJwt: "refresh-2" }),
      },
      {
        match: (u) => u.includes("com.atproto.repo.createRecord"),
        respond: () => jsonResponse({ uri: "at://did:plc:abc/app.bsky.feed.post/1", cid: "c" }),
      },
    ]));

    await t.action(internal.publisher.processScheduledPublications, {});

    // The publication succeeded...
    const pub = await t.run(async (ctx) =>
      ctx.db.get(publicationId as Id<"publications">)
    );
    expect(pub?.status).toBe("published");

    // ...and the post record was created with the freshly-refreshed token.
    const create = calls.find((c) => c.url.includes("com.atproto.repo.createRecord"))!;
    expect((create.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh-access"
    );

    // The rotated tokens were persisted (no longer the stale access token).
    const account = await t.run(async (ctx) =>
      ctx.db.get(socialAccountId as Id<"socialAccounts">)
    );
    expect(account?.encryptedAccessToken).not.toBe(await encryptToken("stale-access"));
  });

  it("does not refresh when the token is not near expiry", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const { publicationId } = await seedDueBlueskyPublication(t, {
      tokenExpiresAt: Date.now() + 60 * 60 * 1000, // an hour out, still valid
    });

    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.repo.createRecord"),
        respond: () => jsonResponse({ uri: "at://did:plc:abc/app.bsky.feed.post/1", cid: "c" }),
      },
    ]));

    await t.action(internal.publisher.processScheduledPublications, {});

    const pub = await t.run(async (ctx) =>
      ctx.db.get(publicationId as Id<"publications">)
    );
    expect(pub?.status).toBe("published");
    expect(calls.some((c) => c.url.includes("refreshSession"))).toBe(false);
  });
});
