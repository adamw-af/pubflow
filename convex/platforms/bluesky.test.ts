import { afterEach, describe, expect, it } from "vitest";
import { blueskyAdapter } from "./bluesky";
import { installFetchStub, jsonResponse as json, type RecordedCall } from "./fetchStub";

let restore: () => void = () => {};
afterEach(() => restore());

const XRPC = "https://bsky.social/xrpc";

describe("blueskyAdapter.publish", () => {
  it("creates an app.bsky.feed.post record and maps the returned uri to a PublishResult", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.repo.createRecord"),
        respond: () => json({ uri: "at://did:plc:abc/app.bsky.feed.post/xyz", cid: "cid1" }),
      },
    ]));

    const result = await blueskyAdapter.publish({
      accessToken: "jwt-access",
      caption: "hello bsky",
      mediaUrls: [],
      platformAccountId: "did:plc:abc",
    });

    expect(result).toEqual({
      success: true,
      platformPostId: "at://did:plc:abc/app.bsky.feed.post/xyz",
    });

    const create = calls.find((c) => c.url.includes("com.atproto.repo.createRecord"))!;
    expect(create.url).toBe(`${XRPC}/com.atproto.repo.createRecord`);
    expect(create.init?.method).toBe("POST");
    expect((create.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-access"
    );
    const body = JSON.parse(create.init!.body as string);
    expect(body.repo).toBe("did:plc:abc");
    expect(body.collection).toBe("app.bsky.feed.post");
    expect(body.record.$type).toBe("app.bsky.feed.post");
    expect(body.record.text).toBe("hello bsky");
    expect(typeof body.record.createdAt).toBe("string");
    expect(body.record.embed).toBeUndefined();
  });

  it("uploads an image blob and embeds it in the post record", async () => {
    const blob = { $type: "blob", ref: { $link: "bafyimg" }, mimeType: "image/png", size: 3 };
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("cdn.example"),
        respond: () =>
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
      },
      {
        match: (u) => u.includes("com.atproto.repo.uploadBlob"),
        respond: () => json({ blob }),
      },
      {
        match: (u) => u.includes("com.atproto.repo.createRecord"),
        respond: () => json({ uri: "at://did:plc:abc/app.bsky.feed.post/img", cid: "cid2" }),
      },
    ]));

    const result = await blueskyAdapter.publish({
      accessToken: "jwt-access",
      caption: "with pic",
      mediaUrls: ["https://cdn.example/pic.png"],
      platformAccountId: "did:plc:abc",
    });

    expect(result.success).toBe(true);

    const upload = calls.find((c) => c.url.includes("com.atproto.repo.uploadBlob"))!;
    expect(upload.init?.method).toBe("POST");
    expect((upload.init?.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect((upload.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-access"
    );

    const create = calls.find((c) => c.url.includes("com.atproto.repo.createRecord"))!;
    const body = JSON.parse(create.init!.body as string);
    expect(body.record.embed.$type).toBe("app.bsky.embed.images");
    expect(body.record.embed.images).toEqual([{ alt: "", image: blob }]);
  });

  it("maps an API error response to an unsuccessful PublishResult", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.repo.createRecord"),
        respond: () => new Response("upstream failure", { status: 500 }),
      },
    ]));

    const result = await blueskyAdapter.publish({
      accessToken: "jwt-access",
      caption: "boom",
      mediaUrls: [],
      platformAccountId: "did:plc:abc",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Bluesky");
  });
});

describe("blueskyAdapter.auth (credentials)", () => {
  it("declares the credentials kind and prompts for handle + app password", () => {
    expect(blueskyAdapter.auth.kind).toBe("credentials");
    if (blueskyAdapter.auth.kind !== "credentials") return;
    const names = blueskyAdapter.auth.fields.map((f) => f.name);
    expect(names).toContain("identifier");
    expect(names).toContain("appPassword");
    const appPasswordField = blueskyAdapter.auth.fields.find((f) => f.name === "appPassword")!;
    expect(appPasswordField.type).toBe("password");
  });

  it("creates a session and maps did/handle/jwts to a TokenResult", async () => {
    if (blueskyAdapter.auth.kind !== "credentials") throw new Error("expected credentials");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.server.createSession"),
        respond: () =>
          json({
            did: "did:plc:abc",
            handle: "adam.bsky.social",
            accessJwt: "access-1",
            refreshJwt: "refresh-1",
          }),
      },
    ]));

    const result = await blueskyAdapter.auth.connect({
      credentials: { identifier: "adam.bsky.social", appPassword: "abcd-efgh-ijkl-mnop" },
    });

    expect(result).toEqual({
      platformAccountId: "did:plc:abc",
      platformUsername: "adam.bsky.social",
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });

    const session = calls.find((c) => c.url.includes("com.atproto.server.createSession"))!;
    expect(session.url).toBe(`${XRPC}/com.atproto.server.createSession`);
    expect(JSON.parse(session.init!.body as string)).toEqual({
      identifier: "adam.bsky.social",
      password: "abcd-efgh-ijkl-mnop",
    });
  });

  it("derives tokenExpiresAt from the access jwt's exp claim", async () => {
    if (blueskyAdapter.auth.kind !== "credentials") throw new Error("expected credentials");
    const expSeconds = 1_900_000_000;
    const b64url = (obj: unknown) =>
      btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const accessJwt = `${b64url({ alg: "none" })}.${b64url({ exp: expSeconds })}.`;

    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.server.createSession"),
        respond: () =>
          json({ did: "did:plc:abc", handle: "adam.bsky.social", accessJwt, refreshJwt: "r" }),
      },
    ]));

    const result = await blueskyAdapter.auth.connect({
      credentials: { identifier: "adam.bsky.social", appPassword: "pw" },
    });

    expect(result.tokenExpiresAt).toBe(expSeconds * 1000);
  });

  it("throws when credentials are rejected", async () => {
    if (blueskyAdapter.auth.kind !== "credentials") throw new Error("expected credentials");
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.server.createSession"),
        respond: () => new Response("Invalid identifier or password", { status: 401 }),
      },
    ]));

    await expect(
      blueskyAdapter.auth.connect({
        credentials: { identifier: "adam.bsky.social", appPassword: "wrong" },
      })
    ).rejects.toThrow();
  });

  it("refreshes a session using the refresh jwt as the bearer token", async () => {
    if (blueskyAdapter.auth.kind !== "credentials") throw new Error("expected credentials");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("com.atproto.server.refreshSession"),
        respond: () => json({ accessJwt: "access-2", refreshJwt: "refresh-2" }),
      },
    ]));

    const result = await blueskyAdapter.auth.refreshToken("refresh-1");

    expect(result).toEqual({ accessToken: "access-2", refreshToken: "refresh-2" });

    const refresh = calls.find((c) => c.url.includes("com.atproto.server.refreshSession"))!;
    expect(refresh.url).toBe(`${XRPC}/com.atproto.server.refreshSession`);
    expect((refresh.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer refresh-1"
    );
  });
});
