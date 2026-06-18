/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { installFetchStub, jsonResponse } from "./platforms/fetchStub";

const modules = import.meta.glob("./**/*.ts");

const IDENTITY = { subject: "user|test", issuer: "https://test", tokenIdentifier: "user|test" };

async function seedWorkspace(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Acme",
      ownerTokenIdentifier: IDENTITY.subject,
      tier: "base",
      timezone: "UTC",
      // On Trial — connecting the first Social Account is allowed (the access
      // gate now blocks connects for expired Workspaces; see computeWorkspaceAccess).
      trialEndsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    await ctx.db.insert("users", {
      tokenIdentifier: IDENTITY.subject,
      workspaceId,
    });
    return workspaceId;
  });
}

describe("beginOAuthFlow (registry-wired OAuth, no regression)", () => {
  it("returns the platform's authorization URL and stores OAuth state", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const url = await t
      .withIdentity(IDENTITY)
      .action(api.oauth.beginOAuthFlow, { platform: "linkedin" });

    expect(url).toContain("https://www.linkedin.com/oauth/v2/authorization");
    expect(url).toContain("state=");

    const states = await t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    const state = states.find((s) => s.workspaceId === (workspaceId as Id<"workspaces">))!;
    expect(state.platform).toBe("linkedin");
    // LinkedIn does not use PKCE
    expect(state.codeVerifier).toBeUndefined();
  });

  it("generates a PKCE verifier for platforms that require it (X)", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);

    const url = await t
      .withIdentity(IDENTITY)
      .action(api.oauth.beginOAuthFlow, { platform: "x" });

    expect(url).toContain("https://x.com/i/oauth2/authorize");
    expect(url).toContain("code_challenge=");

    const states = await t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    expect(states[0].platform).toBe("x");
    expect(states[0].codeVerifier).toBeTypeOf("string");
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.oauth.beginOAuthFlow, { platform: "linkedin" })).rejects.toThrow();
  });

  it("rejects a credentials platform (Bluesky) — it has no redirect flow", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);
    await expect(
      t.withIdentity(IDENTITY).action(api.oauth.beginOAuthFlow, { platform: "bluesky" })
    ).rejects.toThrow();
  });
});

describe("oauthCallback — Facebook maps one grant to many Pages", () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it("connects one active Social Account per admin'd Page, tokens encrypted", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    process.env.FACEBOOK_APP_ID = "app-id";
    process.env.FACEBOOK_APP_SECRET = "app-secret";
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    // One Facebook grant maps to multiple Pages (two here), which exceeds the
    // 1-account Trial free limit. Give this Workspace an active Subscription so
    // the paid tier cap applies and this test isolates Page-mapping, not billing.
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        workspaceId: workspaceId as Id<"workspaces">,
        status: "active",
      });
    });

    // Seed a valid OAuth state for the facebook flow.
    await t.run(async (ctx) => {
      await ctx.db.insert("oauthStates", {
        state: "fb-state",
        workspaceId: workspaceId as Id<"workspaces">,
        userTokenIdentifier: IDENTITY.subject,
        platform: "facebook",
        expiresAt: Date.now() + 60_000,
      });
    });

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/oauth/access_token") && u.includes("code="),
        respond: () => jsonResponse({ access_token: "short-user-token" }),
      },
      {
        match: (u) => u.includes("/oauth/access_token") && u.includes("fb_exchange_token"),
        respond: () => jsonResponse({ access_token: "long-user-token", expires_in: 5184000 }),
      },
      {
        match: (u) => u.includes("/me/accounts"),
        respond: () =>
          jsonResponse({
            data: [
              { id: "pageA", name: "Page A", access_token: "page-a-token" },
              { id: "pageB", name: "Page B", access_token: "page-b-token" },
            ],
          }),
      },
    ]));

    const res = await t.fetch("/oauth/callback/facebook?code=auth-code&state=fb-state", {
      method: "GET",
    });
    // The callback redirects back to the app on success.
    expect(res.status).toBe(302);

    const accounts = await t.run(async (ctx) =>
      ctx.db
        .query("socialAccounts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId as Id<"workspaces">))
        .collect()
    );

    expect(accounts).toHaveLength(2);
    expect(accounts.every((a) => a.platform === "facebook")).toBe(true);
    expect(accounts.every((a) => a.status === "active")).toBe(true);
    expect(accounts.map((a) => a.platformAccountId).sort()).toEqual(["pageA", "pageB"]);
    expect(accounts.map((a) => a.platformUsername).sort()).toEqual(["Page A", "Page B"]);
    // Page tokens are stored encrypted, never in the clear.
    for (const a of accounts) {
      expect(a.encryptedAccessToken).not.toBe("page-a-token");
      expect(a.encryptedAccessToken).not.toBe("page-b-token");
    }

    // The one-time state is consumed.
    const states = await t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    expect(states).toHaveLength(0);
  });
});

describe("connectWithCredentials (credential platforms, e.g. Bluesky)", () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it("creates a session and stores the connected account as active", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = btoa("0".repeat(32));
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.server.createSession"),
        respond: () =>
          jsonResponse({
            did: "did:plc:abc",
            handle: "adam.bsky.social",
            accessJwt: "access-1",
            refreshJwt: "refresh-1",
          }),
      },
    ]));

    await t.withIdentity(IDENTITY).action(api.oauth.connectWithCredentials, {
      platform: "bluesky",
      credentials: { identifier: "adam.bsky.social", appPassword: "abcd-efgh-ijkl-mnop" },
    });

    const accounts = await t.run(async (ctx) =>
      ctx.db
        .query("socialAccounts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId as Id<"workspaces">))
        .collect()
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0].platform).toBe("bluesky");
    expect(accounts[0].platformAccountId).toBe("did:plc:abc");
    expect(accounts[0].platformUsername).toBe("adam.bsky.social");
    expect(accounts[0].status).toBe("active");
    // Tokens must be stored encrypted, never in the clear.
    expect(accounts[0].encryptedAccessToken).not.toBe("access-1");
    expect(accounts[0].encryptedRefreshToken).toBeDefined();
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.oauth.connectWithCredentials, {
        platform: "bluesky",
        credentials: { identifier: "x", appPassword: "y" },
      })
    ).rejects.toThrow();
  });

  it("rejects an OAuth platform — it must use the redirect flow", async () => {
    const t = convexTest(schema, modules);
    await seedWorkspace(t);
    await expect(
      t.withIdentity(IDENTITY).action(api.oauth.connectWithCredentials, {
        platform: "x",
        credentials: { identifier: "x", appPassword: "y" },
      })
    ).rejects.toThrow();
  });
});
