import { afterEach, describe, expect, it, vi } from "vitest";
import { instagramAdapter } from "./instagram";
import { installFetchStub, jsonResponse as json, type RecordedCall } from "./fetchStub";

let restore: () => void = () => {};
afterEach(() => {
  restore();
  vi.useRealTimers();
});

describe("instagramAdapter.publish", () => {
  it("rejects a post with no media (Instagram requires media)", async () => {
    ({ restore } = installFetchStub([]));

    const result = await instagramAdapter.publish({
      accessToken: "tok",
      caption: "no media",
      mediaUrls: [],
      platformAccountId: "ig1",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/requires at least one/i);
  });

  it("creates a single-image container, waits for it to be ready, then publishes", async () => {
    vi.useFakeTimers();
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u, init) => u.includes("/me/media") && !u.includes("media_publish") && init?.method === "POST",
        respond: () => json({ id: "container1" }),
      },
      {
        match: (u) => u.includes("status_code"),
        respond: () => json({ status_code: "FINISHED" }),
      },
      {
        match: (u) => u.includes("media_publish"),
        respond: () => json({ id: "ig_post_1" }),
      },
    ]));

    const pending = instagramAdapter.publish({
      accessToken: "tok",
      caption: "with image",
      mediaUrls: ["https://cdn.example/pic.jpg"],
      platformAccountId: "ig1",
    });
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pending;

    expect(result).toEqual({ success: true, platformPostId: "ig_post_1" });

    const create = calls.find(
      (c) => c.url.includes("/me/media") && !c.url.includes("media_publish")
    )!;
    expect(create.url).toContain("image_url=");
    expect(create.url).toContain("pic.jpg");
  });
});

describe("instagramAdapter.auth.authUrl", () => {
  it("requests the content-publish scope", () => {
    if (instagramAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    const url = instagramAdapter.auth.authUrl({
      state: "st4te",
      callbackUrl: "https://app.example/oauth/callback/instagram",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(parsed.searchParams.get("scope")).toContain("instagram_business_content_publish");
  });
});
