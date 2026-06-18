import { afterEach, describe, expect, it } from "vitest";
import { threadsAdapter } from "./threads";
import { installFetchStub, jsonResponse as json, type RecordedCall } from "./fetchStub";

let restore: () => void = () => {};
afterEach(() => restore());

describe("threadsAdapter.publish", () => {
  it("publishes text via the two-step container→publish flow and maps the media id", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u, init) =>
          u.includes("/user123/threads_publish") && init?.method === "POST",
        respond: () => json({ id: "media999" }),
      },
      {
        match: (u, init) => u.includes("/user123/threads") && init?.method === "POST",
        respond: () => json({ id: "container456" }),
      },
    ]));

    const result = await threadsAdapter.publish({
      accessToken: "th-token",
      caption: "hello threads",
      mediaUrls: [],
      platformAccountId: "user123",
    });

    expect(result).toEqual({ success: true, platformPostId: "media999" });

    // Step 1: create a TEXT container carrying the caption.
    const container = calls.find(
      (c) => c.url.includes("/user123/threads") && !c.url.includes("threads_publish")
    )!;
    expect(container.url).toContain("graph.threads.net");
    expect(container.url).toContain("media_type=TEXT");
    expect(container.url).toContain("text=hello+threads");
    expect(container.url).toContain("access_token=th-token");

    // Step 2: publish the returned container id.
    const publish = calls.find((c) => c.url.includes("/user123/threads_publish"))!;
    expect(publish.url).toContain("creation_id=container456");
    expect(publish.url).toContain("access_token=th-token");
  });

  it("creates a single IMAGE container with its url + caption, then publishes it", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u, init) =>
          u.includes("/user123/threads_publish") && init?.method === "POST",
        respond: () => json({ id: "media_img" }),
      },
      {
        match: (u, init) => u.includes("/user123/threads") && init?.method === "POST",
        respond: () => json({ id: "img_container" }),
      },
    ]));

    const result = await threadsAdapter.publish({
      accessToken: "th-token",
      caption: "a nice photo",
      mediaUrls: ["https://cdn.example/pic.jpg"],
      platformAccountId: "user123",
    });

    expect(result).toEqual({ success: true, platformPostId: "media_img" });

    const container = calls.find(
      (c) => c.url.includes("/user123/threads") && !c.url.includes("threads_publish")
    )!;
    expect(container.url).toContain("media_type=IMAGE");
    expect(container.url).toContain("image_url=https%3A%2F%2Fcdn.example%2Fpic.jpg");
    expect(container.url).toContain("text=a+nice+photo");

    const publish = calls.find((c) => c.url.includes("/user123/threads_publish"))!;
    expect(publish.url).toContain("creation_id=img_container");
  });

  it("builds carousel-item containers then a CAROUSEL parent referencing them", async () => {
    let calls: RecordedCall[];
    let nextChild = 1;
    ({ calls, restore } = installFetchStub([
      {
        match: (u, init) =>
          u.includes("/user123/threads_publish") && init?.method === "POST",
        respond: () => json({ id: "media_carousel" }),
      },
      {
        match: (u, init) =>
          u.includes("/user123/threads") &&
          init?.method === "POST" &&
          u.includes("media_type=CAROUSEL"),
        respond: () => json({ id: "carousel_parent" }),
      },
      {
        match: (u, init) => u.includes("/user123/threads") && init?.method === "POST",
        respond: () => json({ id: `child${nextChild++}` }),
      },
    ]));

    const result = await threadsAdapter.publish({
      accessToken: "th-token",
      caption: "a gallery",
      mediaUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
      platformAccountId: "user123",
    });

    expect(result).toEqual({ success: true, platformPostId: "media_carousel" });

    // Each image is created as an unpublished carousel item.
    const children = calls.filter(
      (c) =>
        c.url.includes("/user123/threads") &&
        c.url.includes("is_carousel_item=true")
    );
    expect(children).toHaveLength(2);

    // The parent CAROUSEL references both child ids and carries the caption.
    const parent = calls.find((c) => c.url.includes("media_type=CAROUSEL"))!;
    expect(parent.url).toContain("children=child1%2Cchild2");
    expect(parent.url).toContain("text=a+gallery");

    const publish = calls.find((c) => c.url.includes("/user123/threads_publish"))!;
    expect(publish.url).toContain("creation_id=carousel_parent");
  });

  it("maps a container-creation error to an unsuccessful PublishResult", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/user123/threads"),
        respond: () => new Response("(#100) Invalid parameter", { status: 400 }),
      },
    ]));

    const result = await threadsAdapter.publish({
      accessToken: "th-token",
      caption: "boom",
      mediaUrls: [],
      platformAccountId: "user123",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Threads");
  });
});

describe("threadsAdapter.auth.authUrl", () => {
  it("builds the Threads authorize URL requesting basic + content-publish scopes", () => {
    if (threadsAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    const url = threadsAdapter.auth.authUrl({
      state: "st4te",
      callbackUrl: "https://app.example/oauth/callback/threads",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("threads.net");
    expect(parsed.pathname).toContain("/oauth/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("st4te");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example/oauth/callback/threads"
    );
    const scope = parsed.searchParams.get("scope") ?? "";
    expect(scope).toContain("threads_basic");
    expect(scope).toContain("threads_content_publish");
  });
});

describe("threadsAdapter.auth.exchangeCode", () => {
  it("exchanges code→short→long token then reads the profile for id + username", async () => {
    if (threadsAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/oauth/access_token"),
        respond: () => json({ access_token: "short-token", user_id: "user123" }),
      },
      {
        match: (u) => u.includes("th_exchange_token"),
        respond: () => json({ access_token: "long-token", expires_in: 5184000 }),
      },
      {
        match: (u) => u.includes("/me"),
        respond: () => json({ id: "user123", username: "adam.threads" }),
      },
    ]));

    const result = await threadsAdapter.auth.exchangeCode({
      code: "auth-code",
      callbackUrl: "https://app.example/oauth/callback/threads",
    });

    const account = Array.isArray(result) ? result[0] : result;
    expect(account.platformAccountId).toBe("user123");
    expect(account.platformUsername).toBe("adam.threads");
    expect(account.accessToken).toBe("long-token");
    expect(account.tokenExpiresAt).toBeGreaterThan(Date.now());

    // The profile is read with the long-lived token, not the short one.
    const me = calls.find((c) => c.url.includes("/me"))!;
    expect(me.url).toContain("access_token=long-token");
  });

  it("propagates a failed code exchange as a thrown error", async () => {
    if (threadsAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/oauth/access_token"),
        respond: () => new Response("invalid code", { status: 400 }),
      },
    ]));

    await expect(
      threadsAdapter.auth.exchangeCode({
        code: "bad",
        callbackUrl: "https://app.example/oauth/callback/threads",
      })
    ).rejects.toThrow(/Threads/);
  });
});

describe("threadsAdapter.auth.refreshToken", () => {
  it("refreshes a long-lived token by presenting the current token", async () => {
    if (threadsAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/refresh_access_token"),
        respond: () => json({ access_token: "refreshed-token", expires_in: 5184000 }),
      },
    ]));

    const result = await threadsAdapter.auth.refreshToken("current-token");

    expect(result.accessToken).toBe("refreshed-token");
    expect(result.expiresAt).toBeGreaterThan(Date.now());

    const refresh = calls.find((c) => c.url.includes("/refresh_access_token"))!;
    expect(refresh.url).toContain("grant_type=th_refresh_token");
    expect(refresh.url).toContain("access_token=current-token");
  });
});
