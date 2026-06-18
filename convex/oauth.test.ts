/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

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
});
