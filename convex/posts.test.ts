/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { PlatformId } from "./platforms/metadata";

const modules = import.meta.glob("./**/*.ts");

const IDENTITY = { subject: "user|test", issuer: "https://test", tokenIdentifier: "user|test" };

async function seedWorkspace(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerTokenIdentifier: IDENTITY.subject,
      tier: "base",
      timezone: "UTC",
    });
    await ctx.db.insert("users", {
      tokenIdentifier: IDENTITY.subject,
      workspaceId,
    });
    return workspaceId as Id<"workspaces">;
  });
}

async function seedAccount(
  t: ReturnType<typeof convexTest>,
  workspaceId: Id<"workspaces">,
  platform: PlatformId
) {
  return (await t.run(async (ctx) =>
    ctx.db.insert("socialAccounts", {
      workspaceId,
      platform,
      platformAccountId: `${platform}-acct`,
      platformUsername: `@${platform}`,
      encryptedAccessToken: "enc",
      status: "active",
    })
  )) as Id<"socialAccounts">;
}

async function seedImage(
  t: ReturnType<typeof convexTest>,
  workspaceId: Id<"workspaces">
) {
  return (await t.run(async (ctx) =>
    ctx.db.insert("mediaItems", {
      workspaceId,
      uploadedByTokenIdentifier: IDENTITY.subject,
      r2Key: "media/x.jpg",
      filename: "x.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      createdAt: Date.now(),
    })
  )) as Id<"mediaItems">;
}

describe("validateComposition", () => {
  it("returns no errors for a valid composition across platforms", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const linkedin = await seedAccount(t, workspaceId, "linkedin");
    const x = await seedAccount(t, workspaceId, "x");

    const results = await t.withIdentity(IDENTITY).query(api.posts.validateComposition, {
      variants: [
        { socialAccountId: linkedin, caption: "A perfectly fine post" },
        { socialAccountId: x, caption: "Short and sweet" },
      ],
    });

    expect(results).toHaveLength(2);
    for (const r of results) expect(r.errors).toEqual([]);
  });

  it("flags only the offending Platform, leaving valid ones clean", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const linkedin = await seedAccount(t, workspaceId, "linkedin");
    const x = await seedAccount(t, workspaceId, "x");

    // 300 chars: fine for LinkedIn (3000), over the limit for X (280).
    const longCaption = "a".repeat(300);

    const results = await t.withIdentity(IDENTITY).query(api.posts.validateComposition, {
      variants: [
        { socialAccountId: linkedin, caption: longCaption },
        { socialAccountId: x, caption: longCaption },
      ],
    });

    const byAccount = Object.fromEntries(results.map((r) => [r.socialAccountId, r]));
    expect(byAccount[linkedin].errors).toEqual([]);
    expect(byAccount[x].errors.map((e) => e.code)).toEqual(["caption_too_long"]);
  });

  it("flags an Instagram variant with no media as media_required", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const instagram = await seedAccount(t, workspaceId, "instagram");

    const results = await t.withIdentity(IDENTITY).query(api.posts.validateComposition, {
      variants: [{ socialAccountId: instagram, caption: "no photo attached" }],
    });

    expect(results[0].errors.map((e) => e.code)).toContain("media_required");
  });

  it("accepts an Instagram variant once an image is attached", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const instagram = await seedAccount(t, workspaceId, "instagram");
    const image = await seedImage(t, workspaceId);

    const results = await t.withIdentity(IDENTITY).query(api.posts.validateComposition, {
      variants: [
        { socialAccountId: instagram, caption: "now with a photo", mediaItemIds: [image] },
      ],
    });

    expect(results[0].errors).toEqual([]);
  });
});

describe("createPost capability gating", () => {
  const SCHEDULED_AT = Date.now() + 3_600_000;

  async function publicationsFor(
    t: ReturnType<typeof convexTest>,
    postId: Id<"posts">
  ) {
    return t.run(async (ctx) => {
      const all = await ctx.db.query("publications").collect();
      return all.filter((p) => p.postId === postId);
    });
  }

  it("schedules the valid Platforms even when one target is blocked", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const linkedin = await seedAccount(t, workspaceId, "linkedin");
    const x = await seedAccount(t, workspaceId, "x");

    const longCaption = "a".repeat(300); // over X's 280 limit, fine for LinkedIn

    const postId = (await t.withIdentity(IDENTITY).mutation(api.posts.createPost, {
      scheduledAt: SCHEDULED_AT,
      variants: [
        { socialAccountId: linkedin, caption: longCaption },
        { socialAccountId: x, caption: longCaption },
      ],
    })) as Id<"posts">;

    const pubs = await publicationsFor(t, postId);
    // The valid LinkedIn target is scheduled; the blocked X target is not.
    expect(pubs).toHaveLength(1);
    expect(pubs[0].socialAccountId).toBe(linkedin);

    const post = await t.run(async (ctx) => ctx.db.get(postId));
    expect(post?.status).toBe("scheduled");
  });

  it("rejects scheduling when every target is blocked", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const x = await seedAccount(t, workspaceId, "x");

    await expect(
      t.withIdentity(IDENTITY).mutation(api.posts.createPost, {
        scheduledAt: SCHEDULED_AT,
        variants: [{ socialAccountId: x, caption: "a".repeat(300) }],
      })
    ).rejects.toThrow();
  });

  it("saves an invalid variant as a draft without validating", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const x = await seedAccount(t, workspaceId, "x");

    const postId = (await t.withIdentity(IDENTITY).mutation(api.posts.createPost, {
      // no scheduledAt → draft
      variants: [{ socialAccountId: x, caption: "a".repeat(300) }],
    })) as Id<"posts">;

    const post = await t.run(async (ctx) => ctx.db.get(postId));
    expect(post?.status).toBe("draft");
    expect(await publicationsFor(t, postId)).toHaveLength(0);
  });

  it("applies the same gating when editing a draft into a schedule", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const linkedin = await seedAccount(t, workspaceId, "linkedin");
    const x = await seedAccount(t, workspaceId, "x");

    // Start as a draft with a caption that only X rejects.
    const longCaption = "a".repeat(300);
    const postId = (await t.withIdentity(IDENTITY).mutation(api.posts.createPost, {
      variants: [
        { socialAccountId: linkedin, caption: longCaption },
        { socialAccountId: x, caption: longCaption },
      ],
    })) as Id<"posts">;

    // Now schedule it via updatePost.
    await t.withIdentity(IDENTITY).mutation(api.posts.updatePost, {
      postId,
      scheduledAt: SCHEDULED_AT,
      variants: [
        { socialAccountId: linkedin, caption: longCaption },
        { socialAccountId: x, caption: longCaption },
      ],
    });

    const pubs = await publicationsFor(t, postId);
    expect(pubs).toHaveLength(1);
    expect(pubs[0].socialAccountId).toBe(linkedin);
  });
});
