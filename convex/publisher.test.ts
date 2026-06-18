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
