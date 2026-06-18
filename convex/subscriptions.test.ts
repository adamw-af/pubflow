/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const IDENTITY = {
  subject: "user|test",
  issuer: "https://test",
  tokenIdentifier: "user|test",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Seed a Workspace (+ its owner User row) with control over the Trial window
 * and tier. `trialEndsAt: null` models a back-compat row created before Trials
 * existed (the field is simply absent).
 */
async function seedWorkspace(
  t: ReturnType<typeof convexTest>,
  opts: {
    trialEndsAt?: number | null;
    tier?: "base" | "pro" | "premium";
  } = {}
) {
  const { trialEndsAt = Date.now() + 7 * DAY_MS, tier = "base" } = opts;
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerTokenIdentifier: IDENTITY.subject,
      tier,
      timezone: "UTC",
      ...(trialEndsAt === null ? {} : { trialEndsAt }),
    });
    await ctx.db.insert("users", {
      tokenIdentifier: IDENTITY.subject,
      workspaceId,
    });
    return workspaceId as Id<"workspaces">;
  });
}

async function seedActiveSubscription(
  t: ReturnType<typeof convexTest>,
  workspaceId: Id<"workspaces">
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("subscriptions", {
      workspaceId,
      status: "active",
    });
  });
}

async function seedAccount(
  t: ReturnType<typeof convexTest>,
  workspaceId: Id<"workspaces">,
  opts: { platformAccountId?: string; status?: "active" | "expired" | "revoked" } = {}
) {
  const { platformAccountId = `x-${Math.random()}`, status = "active" } = opts;
  return await t.run(async (ctx) =>
    ctx.db.insert("socialAccounts", {
      workspaceId,
      platform: "x",
      platformAccountId,
      platformUsername: "@acme",
      encryptedAccessToken: "enc",
      status,
    })
  );
}

function getAccess(t: ReturnType<typeof convexTest>) {
  return t.withIdentity(IDENTITY).query(api.subscriptions.getWorkspaceAccess, {});
}

describe("getWorkspaceAccess — Trial state", () => {
  it("a new Workspace with no Subscription is on Trial with days remaining", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, { trialEndsAt: Date.now() + 7 * DAY_MS });

    const access = await getAccess(t);

    expect(access?.state).toBe("trial");
    expect(access?.trialDaysRemaining).toBe(7);
    // No account connected yet → may connect its first.
    expect(access?.canConnectAnotherAccount).toBe(true);
    expect(access?.reason).toBeUndefined();
  });

  it("a Trial Workspace may connect its first Social Account", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    await seedAccount(t, workspaceId, { platformAccountId: "first" });

    const access = await getAccess(t);

    expect(access?.state).toBe("trial");
    // One account is the free limit — a second is gated.
    expect(access?.canConnectAnotherAccount).toBe(false);
    expect(access?.reason).toBe("account_limit");
  });

  it("a revoked (disconnected) account does not count against the Trial limit", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    await seedAccount(t, workspaceId, { status: "revoked" });

    const access = await getAccess(t);

    expect(access?.state).toBe("trial");
    expect(access?.canConnectAnotherAccount).toBe(true);
  });
});

describe("getWorkspaceAccess — expiry", () => {
  it("no Subscription past trialEndsAt is expired with a trial_expired reason", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, { trialEndsAt: Date.now() - DAY_MS });

    const access = await getAccess(t);

    expect(access?.state).toBe("expired");
    expect(access?.reason).toBe("trial_expired");
    expect(access?.canConnectAnotherAccount).toBe(false);
  });

  it("back-compat: a Workspace with no trialEndsAt and no Subscription is expired", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t, { trialEndsAt: null });

    const access = await getAccess(t);

    expect(access?.state).toBe("expired");
    expect(access?.reason).toBe("trial_expired");
  });
});

describe("getWorkspaceAccess — active Subscription", () => {
  it("an active Subscription lands in the dashboard regardless of the Trial window", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, { trialEndsAt: Date.now() - DAY_MS });
    await seedActiveSubscription(t, workspaceId);

    const access = await getAccess(t);

    expect(access?.state).toBe("active");
    expect(access?.trialDaysRemaining).toBeUndefined();
  });

  it("the paid tier cap is distinct from the 1-account Trial free limit", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t, { tier: "base" });
    await seedActiveSubscription(t, workspaceId);
    // Two accounts — over the Trial free limit of 1, but well under base's 25.
    await seedAccount(t, workspaceId, { platformAccountId: "a" });
    await seedAccount(t, workspaceId, { platformAccountId: "b" });

    const access = await getAccess(t);

    expect(access?.state).toBe("active");
    expect(access?.canConnectAnotherAccount).toBe(true);
    expect(access?.reason).toBeUndefined();
  });
});

describe("connect-account enforcement (upsertSocialAccount)", () => {
  it("allows the first connect on Trial and blocks the second server-side", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await t.mutation(internal.oauth.upsertSocialAccount, {
      workspaceId,
      platform: "x",
      platformAccountId: "first",
      platformUsername: "@first",
      encryptedAccessToken: "enc",
    });

    await expect(
      t.mutation(internal.oauth.upsertSocialAccount, {
        workspaceId,
        platform: "linkedin",
        platformAccountId: "second",
        platformUsername: "@second",
        encryptedAccessToken: "enc",
      })
    ).rejects.toThrow();
  });

  it("re-connecting an existing account is not blocked by the free limit", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    await seedAccount(t, workspaceId, { platformAccountId: "x-acct" });

    // Same platform + platformAccountId → patch path, must be allowed even at limit.
    await expect(
      t.mutation(internal.oauth.upsertSocialAccount, {
        workspaceId,
        platform: "x",
        platformAccountId: "x-acct",
        platformUsername: "@renamed",
        encryptedAccessToken: "enc2",
      })
    ).resolves.not.toThrow();
  });
});
