import { afterEach, describe, expect, it } from "vitest";
import { xAdapter } from "./x";
import { installFetchStub, jsonResponse as json, type RecordedCall } from "./fetchStub";

let restore: () => void = () => {};
afterEach(() => restore());

describe("xAdapter.publish", () => {
  it("posts a text-only tweet and maps data.data.id to a PublishResult", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      { match: (u) => u.includes("/2/tweets"), respond: () => json({ data: { id: "tweet42" } }) },
    ]));

    const result = await xAdapter.publish({
      accessToken: "tok",
      caption: "gm",
      mediaUrls: [],
      platformAccountId: "user1",
    });

    expect(result).toEqual({ success: true, platformPostId: "tweet42" });

    const post = calls.find((c) => c.url.includes("/2/tweets"))!;
    expect(post.init?.method).toBe("POST");
    expect(JSON.parse(post.init!.body as string)).toEqual({ text: "gm" });
  });

  it("maps an API error response to an unsuccessful PublishResult", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/2/tweets"),
        respond: () => new Response("rate limited", { status: 429 }),
      },
    ]));

    const result = await xAdapter.publish({
      accessToken: "tok",
      caption: "gm",
      mediaUrls: [],
      platformAccountId: "user1",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("X API error");
  });
});

describe("xAdapter.auth.authUrl", () => {
  it("includes the PKCE code challenge and S256 method", () => {
    if (xAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    const url = xAdapter.auth.authUrl({
      state: "st4te",
      callbackUrl: "https://app.example/oauth/callback/x",
      codeChallenge: "chal",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(parsed.searchParams.get("code_challenge")).toBe("chal");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("scope")).toContain("tweet.write");
  });

  it("declares that it uses PKCE", () => {
    expect(xAdapter.auth.kind).toBe("oauth");
    if (xAdapter.auth.kind !== "oauth") return;
    expect(xAdapter.auth.usesPKCE).toBe(true);
  });
});
