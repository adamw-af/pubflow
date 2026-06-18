import { afterEach, describe, expect, it } from "vitest";
import { tiktokAdapter } from "./tiktok";
import { installFetchStub, jsonResponse as json, type RecordedCall } from "./fetchStub";

let restore: () => void = () => {};
afterEach(() => restore());

// TikTok publishing is asynchronous (ADR 0007): publish() only *initiates* the
// upload (PULL_FROM_URL from R2) and returns the in-progress shape carrying the
// publish_id; the cron poll sweep later calls checkStatus(publish_id) until the
// Platform finishes transcoding and the Post is live (or rejected).

describe("tiktokAdapter.publish", () => {
  it("inits a PULL_FROM_URL video post and returns in-progress with the publish_id", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/v2/post/publish/video/init/"),
        respond: () => json({ data: { publish_id: "pub_123" }, error: { code: "ok" } }),
      },
    ]));

    const result = await tiktokAdapter.publish({
      accessToken: "tk-token",
      caption: "my first clip",
      mediaUrls: ["https://cdn.example/clip.mp4"],
      platformAccountId: "open_id_1",
      options: { tiktok: { privacyLevel: "SELF_ONLY", disclosureEnabled: false } },
    });

    expect(result).toEqual({ success: true, inProgress: true, jobHandle: "pub_123" });

    const init = calls.find((c) => c.url.includes("/video/init/"))!;
    expect(init.init?.method).toBe("POST");
    const headers = init.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tk-token");
    const body = JSON.parse(init.init?.body as string);
    expect(body.source_info).toEqual({
      source: "PULL_FROM_URL",
      video_url: "https://cdn.example/clip.mp4",
    });
    expect(body.post_info.title).toBe("my first clip");
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
  });

  it("maps the required privacy + commercial-disclosure toggles into post_info", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/v2/post/publish/video/init/"),
        respond: () => json({ data: { publish_id: "pub_x" }, error: { code: "ok" } }),
      },
    ]));

    await tiktokAdapter.publish({
      accessToken: "tk-token",
      caption: "ad",
      mediaUrls: ["https://cdn.example/clip.mp4"],
      platformAccountId: "open_id_1",
      options: {
        tiktok: {
          privacyLevel: "PUBLIC_TO_EVERYONE",
          disclosureEnabled: true,
          brandedContent: true,
          yourBrand: false,
        },
      },
    });

    const body = JSON.parse(calls.find((c) => c.url.includes("/video/init/"))!.init?.body as string);
    expect(body.post_info.privacy_level).toBe("PUBLIC_TO_EVERYONE");
    expect(body.post_info.brand_content_toggle).toBe(true);
    expect(body.post_info.brand_organic_toggle).toBe(false);
  });

  it("defaults to SELF_ONLY privacy when no options are supplied (safe for unaudited apps)", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/video/init/"),
        respond: () => json({ data: { publish_id: "pub_d" }, error: { code: "ok" } }),
      },
    ]));

    await tiktokAdapter.publish({
      accessToken: "tk-token",
      caption: "no opts",
      mediaUrls: ["https://cdn.example/clip.mp4"],
      platformAccountId: "open_id_1",
    });

    const body = JSON.parse(calls.find((c) => c.url.includes("/video/init/"))!.init?.body as string);
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
  });

  it("maps an init error (e.g. invalid token / url not verified) to a failed result", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/video/init/"),
        respond: () =>
          json(
            { error: { code: "url_ownership_unverified", message: "Domain not verified" } },
            403
          ),
      },
    ]));

    const result = await tiktokAdapter.publish({
      accessToken: "tk-token",
      caption: "boom",
      mediaUrls: ["https://cdn.example/clip.mp4"],
      platformAccountId: "open_id_1",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("TikTok");
  });
});

describe("tiktokAdapter.checkStatus", () => {
  const args = { accessToken: "tk-token", jobHandle: "pub_123", platformAccountId: "open_id_1" };

  it("reports in_progress while TikTok is still processing the upload", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/v2/post/publish/status/fetch/"),
        respond: () => json({ data: { status: "PROCESSING_UPLOAD" }, error: { code: "ok" } }),
      },
    ]));

    const result = await tiktokAdapter.checkStatus!(args);
    expect(result).toEqual({ status: "in_progress" });

    const fetchCall = calls.find((c) => c.url.includes("/status/fetch/"))!;
    expect(JSON.parse(fetchCall.init?.body as string)).toEqual({ publish_id: "pub_123" });
    expect((fetchCall.init?.headers as Record<string, string>).Authorization).toBe("Bearer tk-token");
  });

  it("reports published with the public post id once PUBLISH_COMPLETE", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/status/fetch/"),
        respond: () =>
          json({
            data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7777"] },
            error: { code: "ok" },
          }),
      },
    ]));

    const result = await tiktokAdapter.checkStatus!(args);
    expect(result).toEqual({ status: "published", platformPostId: "7777" });
  });

  it("reports failed with the platform's reason so the user can fix and retry", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/status/fetch/"),
        respond: () =>
          json({
            data: { status: "FAILED", fail_reason: "video_duration_too_long" },
            error: { code: "ok" },
          }),
      },
    ]));

    const result = await tiktokAdapter.checkStatus!(args);
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toContain("video_duration_too_long");
  });
});

describe("tiktokAdapter.auth.authUrl", () => {
  it("builds the TikTok authorize URL requesting video.publish scope", () => {
    if (tiktokAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    const url = tiktokAdapter.auth.authUrl({
      state: "st4te",
      callbackUrl: "https://app.example/oauth/callback/tiktok",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.tiktok.com");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("st4te");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example/oauth/callback/tiktok"
    );
    expect(parsed.searchParams.get("scope") ?? "").toContain("video.publish");
  });
});

describe("tiktokAdapter.auth.exchangeCode", () => {
  it("exchanges code for tokens + open_id, then reads the profile for a username", async () => {
    if (tiktokAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/v2/oauth/token/"),
        respond: () =>
          json({
            access_token: "acc-token",
            refresh_token: "ref-token",
            open_id: "open_id_1",
            expires_in: 86400,
          }),
      },
      {
        match: (u) => u.includes("/v2/user/info/"),
        respond: () => json({ data: { user: { open_id: "open_id_1", display_name: "Adam" } } }),
      },
    ]));

    const result = await tiktokAdapter.auth.exchangeCode({
      code: "auth-code",
      callbackUrl: "https://app.example/oauth/callback/tiktok",
    });

    const account = Array.isArray(result) ? result[0] : result;
    expect(account.platformAccountId).toBe("open_id_1");
    expect(account.platformUsername).toBe("Adam");
    expect(account.accessToken).toBe("acc-token");
    expect(account.refreshToken).toBe("ref-token");
    expect(account.tokenExpiresAt).toBeGreaterThan(Date.now());

    const userInfo = calls.find((c) => c.url.includes("/v2/user/info/"))!;
    expect((userInfo.init?.headers as Record<string, string>).Authorization).toBe("Bearer acc-token");
  });

  it("propagates a failed code exchange as a thrown error", async () => {
    if (tiktokAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/v2/oauth/token/"),
        respond: () => new Response("bad code", { status: 400 }),
      },
    ]));

    await expect(
      tiktokAdapter.auth.exchangeCode({
        code: "bad",
        callbackUrl: "https://app.example/oauth/callback/tiktok",
      })
    ).rejects.toThrow(/TikTok/);
  });
});

describe("tiktokAdapter.auth.refreshToken", () => {
  it("refreshes via the refresh_token grant and returns the rotated tokens", async () => {
    if (tiktokAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/v2/oauth/token/"),
        respond: () =>
          json({ access_token: "new-acc", refresh_token: "new-ref", expires_in: 86400 }),
      },
    ]));

    const result = await tiktokAdapter.auth.refreshToken("old-ref");
    expect(result.accessToken).toBe("new-acc");
    expect(result.refreshToken).toBe("new-ref");
    expect(result.expiresAt).toBeGreaterThan(Date.now());

    const body = String(calls.find((c) => c.url.includes("/v2/oauth/token/"))!.init?.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-ref");
  });
});
