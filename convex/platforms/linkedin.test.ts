import { afterEach, describe, expect, it, vi } from "vitest";
import { linkedinAdapter } from "./linkedin";

type Stub = { match: (url: string, init?: RequestInit) => boolean; respond: () => Response };

/** Stub global.fetch, matching requests in order of the provided rules. */
function stubFetch(stubs: Stub[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = vi.fn(async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    const stub = stubs.find((s) => s.match(url, init));
    if (!stub) throw new Error(`Unexpected fetch: ${url}`);
    return stub.respond();
  }) as any;
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("linkedinAdapter.publish", () => {
  it("builds a text-only ugcPost and maps the response id to a PublishResult", async () => {
    const calls = stubFetch([
      { match: (u) => u.includes("/v2/userinfo"), respond: () => json({ sub: "member123" }) },
      { match: (u) => u.includes("/v2/ugcPosts"), respond: () => json({ id: "urn:li:share:999" }) },
    ]);

    const result = await linkedinAdapter.publish({
      accessToken: "tok",
      caption: "hello world",
      mediaUrls: [],
      platformAccountId: "member123",
    });

    expect(result).toEqual({ success: true, platformPostId: "urn:li:share:999" });

    const postCall = calls.find((c) => c.url.includes("/v2/ugcPosts"))!;
    expect(postCall.init?.method).toBe("POST");
    const body = JSON.parse(postCall.init!.body as string);
    expect(body.author).toBe("urn:li:person:member123");
    expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toBe(
      "hello world"
    );
    expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory).toBe("NONE");
  });

  it("maps an API error response to an unsuccessful PublishResult", async () => {
    stubFetch([
      { match: (u) => u.includes("/v2/userinfo"), respond: () => json({ sub: "member123" }) },
      {
        match: (u) => u.includes("/v2/ugcPosts"),
        respond: () => new Response("quota exceeded", { status: 429 }),
      },
    ]);

    const result = await linkedinAdapter.publish({
      accessToken: "tok",
      caption: "hi",
      mediaUrls: [],
      platformAccountId: "member123",
    });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.error).toContain("LinkedIn API error");
  });
});

describe("linkedinAdapter.oauth.authUrl", () => {
  it("builds the LinkedIn authorization URL with client id, scope and redirect", () => {
    const url = linkedinAdapter.oauth.authUrl({
      state: "st4te",
      callbackUrl: "https://app.example/oauth/callback/linkedin",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization"
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("st4te");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example/oauth/callback/linkedin"
    );
    expect(parsed.searchParams.get("scope")).toContain("w_member_social");
  });
});
