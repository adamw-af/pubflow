import { afterEach, describe, expect, it } from "vitest";
import { facebookAdapter } from "./facebook";
import { installFetchStub, jsonResponse as json, type RecordedCall } from "./fetchStub";

let restore: () => void = () => {};
afterEach(() => restore());

describe("facebookAdapter.publish", () => {
  it("posts text to the Page feed with the Page token and maps the returned id", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u, init) => u.includes("/page123/feed") && init?.method === "POST",
        respond: () => json({ id: "page123_post456" }),
      },
    ]));

    const result = await facebookAdapter.publish({
      accessToken: "page-token",
      caption: "hello facebook",
      mediaUrls: [],
      platformAccountId: "page123",
    });

    expect(result).toEqual({ success: true, platformPostId: "page123_post456" });

    const feed = calls.find((c) => c.url.includes("/page123/feed"))!;
    expect(feed.url).toContain("graph.facebook.com");
    expect(feed.url).toContain("message=hello+facebook");
    expect(feed.url).toContain("access_token=page-token");
  });

  it("posts a single image to the Page photos edge with its url and caption", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u, init) => u.includes("/page123/photos") && init?.method === "POST",
        respond: () => json({ id: "photo789", post_id: "page123_post789" }),
      },
    ]));

    const result = await facebookAdapter.publish({
      accessToken: "page-token",
      caption: "a nice photo",
      mediaUrls: ["https://cdn.example/pic.jpg"],
      platformAccountId: "page123",
    });

    // Facebook returns post_id for a published photo; prefer it over the photo id.
    expect(result).toEqual({ success: true, platformPostId: "page123_post789" });

    const photo = calls.find((c) => c.url.includes("/page123/photos"))!;
    expect(photo.url).toContain("url=https%3A%2F%2Fcdn.example%2Fpic.jpg");
    expect(photo.url).toContain("caption=a+nice+photo");
    expect(photo.url).toContain("access_token=page-token");
  });

  it("uploads each image unpublished then attaches them to a single feed post", async () => {
    let calls: RecordedCall[];
    let nextPhotoId = 1;
    ({ calls, restore } = installFetchStub([
      {
        match: (u, init) => u.includes("/page123/photos") && init?.method === "POST",
        respond: () => json({ id: `ph${nextPhotoId++}` }),
      },
      {
        match: (u, init) => u.includes("/page123/feed") && init?.method === "POST",
        respond: () => json({ id: "page123_gallerypost" }),
      },
    ]));

    const result = await facebookAdapter.publish({
      accessToken: "page-token",
      caption: "a gallery",
      mediaUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
      platformAccountId: "page123",
    });

    expect(result).toEqual({ success: true, platformPostId: "page123_gallerypost" });

    // Each photo is uploaded unpublished (published=false) so it can be attached.
    const photos = calls.filter((c) => c.url.includes("/page123/photos"));
    expect(photos).toHaveLength(2);
    for (const p of photos) expect(p.url).toContain("published=false");

    // The feed post carries the caption and references both photo ids.
    const feed = calls.find((c) => c.url.includes("/page123/feed"))!;
    expect(feed.url).toContain("message=a+gallery");
    expect(decodeURIComponent(feed.url)).toContain('"media_fbid":"ph1"');
    expect(decodeURIComponent(feed.url)).toContain('"media_fbid":"ph2"');
  });

  it("maps a Graph API error response to an unsuccessful PublishResult", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/page123/feed"),
        respond: () => new Response("(#200) Permissions error", { status: 403 }),
      },
    ]));

    const result = await facebookAdapter.publish({
      accessToken: "page-token",
      caption: "boom",
      mediaUrls: [],
      platformAccountId: "page123",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Facebook");
  });
});

describe("facebookAdapter.auth.authUrl", () => {
  it("builds the Facebook Login dialog requesting Page list + publish scopes", () => {
    if (facebookAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    const url = facebookAdapter.auth.authUrl({
      state: "st4te",
      callbackUrl: "https://app.example/oauth/callback/facebook",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.facebook.com");
    expect(parsed.pathname).toContain("/dialog/oauth");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("st4te");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example/oauth/callback/facebook"
    );
    const scope = parsed.searchParams.get("scope") ?? "";
    expect(scope).toContain("pages_show_list");
    expect(scope).toContain("pages_manage_posts");
  });
});

describe("facebookAdapter.auth.exchangeCode", () => {
  it("returns one TokenResult per admin'd Page, each carrying its own Page token", async () => {
    if (facebookAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/oauth/access_token") && u.includes("code="),
        respond: () => json({ access_token: "short-user-token" }),
      },
      {
        match: (u) => u.includes("/oauth/access_token") && u.includes("fb_exchange_token"),
        respond: () => json({ access_token: "long-user-token", expires_in: 5184000 }),
      },
      {
        match: (u) => u.includes("/me/accounts"),
        respond: () =>
          json({
            data: [
              { id: "pageA", name: "Page A", access_token: "page-a-token" },
              { id: "pageB", name: "Page B", access_token: "page-b-token" },
            ],
          }),
      },
    ]));

    const result = await facebookAdapter.auth.exchangeCode({
      code: "auth-code",
      callbackUrl: "https://app.example/oauth/callback/facebook",
    });

    const accounts = Array.isArray(result) ? result : [result];
    expect(accounts).toEqual([
      {
        platformAccountId: "pageA",
        platformUsername: "Page A",
        accessToken: "page-a-token",
      },
      {
        platformAccountId: "pageB",
        platformUsername: "Page B",
        accessToken: "page-b-token",
      },
    ]);

    // The Page list is fetched with the long-lived user token, not the short one.
    const accountsCall = calls.find((c) => c.url.includes("/me/accounts"))!;
    expect(accountsCall.url).toContain("access_token=long-user-token");
  });

  it("propagates a failed code exchange as a thrown error", async () => {
    if (facebookAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/oauth/access_token") && u.includes("code="),
        respond: () => new Response("invalid code", { status: 400 }),
      },
    ]));

    await expect(
      facebookAdapter.auth.exchangeCode({
        code: "bad",
        callbackUrl: "https://app.example/oauth/callback/facebook",
      })
    ).rejects.toThrow(/Facebook/);
  });
});

describe("facebookAdapter.auth.refreshToken", () => {
  it("throws — Page tokens are long-lived and never refreshed", async () => {
    if (facebookAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    await expect(facebookAdapter.auth.refreshToken("anything")).rejects.toThrow(/long-lived/);
  });
});
