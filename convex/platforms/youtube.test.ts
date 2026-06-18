import { afterEach, describe, expect, it } from "vitest";
import { youtubeAdapter } from "./youtube";
import { installFetchStub, jsonResponse as json, type RecordedCall } from "./fetchStub";

let restore: () => void = () => {};
afterEach(() => restore());

// YouTube Shorts publishing is asynchronous (ADR 0007). Unlike TikTok's
// PULL_FROM_URL, YouTube has no pull source: publish() streams the bytes from R2
// through a *resumable upload* (POST to open a session → PUT the bytes) and
// returns the in-progress shape carrying the new video id as the job handle. The
// cron poll sweep later calls checkStatus(videoId) until YouTube finishes
// processing (videos.list?part=status,processingDetails) and the Short is live
// (or rejected).

const VIDEO_URL = "https://cdn.example/clip.mp4";
const SESSION_URI =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=sess_1";

function videoBytesResponse() {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    headers: { "Content-Type": "video/mp4" },
  });
}

describe("youtubeAdapter.publish", () => {
  it("runs the resumable upload from R2 and returns in-progress with the video id", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      { match: (u) => u === VIDEO_URL, respond: videoBytesResponse },
      {
        match: (u, i) => u.includes("/upload/youtube/v3/videos") && i?.method === "POST",
        respond: () =>
          new Response(null, { status: 200, headers: { Location: SESSION_URI } }),
      },
      {
        match: (_u, i) => i?.method === "PUT",
        respond: () => json({ id: "vid_123", status: { uploadStatus: "uploaded" } }, 201),
      },
    ]));

    const result = await youtubeAdapter.publish({
      accessToken: "yt-token",
      caption: "watch this",
      mediaUrls: [VIDEO_URL],
      platformAccountId: "chan_1",
      options: { youtube: { title: "My Short" } },
    });

    expect(result).toEqual({ success: true, inProgress: true, jobHandle: "vid_123" });

    // Step 1: open a resumable session, carrying the title + description metadata.
    const init = calls.find(
      (c) => c.url.includes("/upload/youtube/v3/videos") && c.init?.method === "POST"
    )!;
    expect(init.url).toContain("uploadType=resumable");
    expect(init.url).toContain("part=snippet,status");
    const initHeaders = init.init?.headers as Record<string, string>;
    expect(initHeaders.Authorization).toBe("Bearer yt-token");
    expect(initHeaders["X-Upload-Content-Type"]).toBe("video/mp4");
    expect(initHeaders["X-Upload-Content-Length"]).toBe("4");
    const body = JSON.parse(init.init?.body as string);
    expect(body.snippet.title).toBe("My Short");
    expect(body.snippet.description).toBe("watch this");
    expect(body.status.privacyStatus).toBeTruthy();

    // Step 2: PUT the bytes to the session URI from the Location header.
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(put.url).toBe(SESSION_URI);
  });

  it("fails when no video is attached (a Short requires a video)", async () => {
    ({ restore } = installFetchStub([]));
    const result = await youtubeAdapter.publish({
      accessToken: "yt-token",
      caption: "no video",
      mediaUrls: [],
      platformAccountId: "chan_1",
      options: { youtube: { title: "My Short" } },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("video");
  });

  it("fails when no title is supplied (YouTube requires a title)", async () => {
    ({ restore } = installFetchStub([]));
    const result = await youtubeAdapter.publish({
      accessToken: "yt-token",
      caption: "has video, no title",
      mediaUrls: [VIDEO_URL],
      platformAccountId: "chan_1",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("title");
  });

  it("maps a failed session init (e.g. quota / invalid token) to a failed result", async () => {
    ({ restore } = installFetchStub([
      { match: (u) => u === VIDEO_URL, respond: videoBytesResponse },
      {
        match: (u, i) => u.includes("/upload/youtube/v3/videos") && i?.method === "POST",
        respond: () =>
          json({ error: { message: "The request cannot be completed because you have exceeded your quota." } }, 403),
      },
    ]));

    const result = await youtubeAdapter.publish({
      accessToken: "yt-token",
      caption: "boom",
      mediaUrls: [VIDEO_URL],
      platformAccountId: "chan_1",
      options: { youtube: { title: "My Short" } },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("YouTube");
  });

  it("maps a failed byte upload to a failed result", async () => {
    ({ restore } = installFetchStub([
      { match: (u) => u === VIDEO_URL, respond: videoBytesResponse },
      {
        match: (u, i) => u.includes("/upload/youtube/v3/videos") && i?.method === "POST",
        respond: () =>
          new Response(null, { status: 200, headers: { Location: SESSION_URI } }),
      },
      {
        match: (_u, i) => i?.method === "PUT",
        respond: () => json({ error: { message: "upload failed" } }, 500),
      },
    ]));

    const result = await youtubeAdapter.publish({
      accessToken: "yt-token",
      caption: "boom",
      mediaUrls: [VIDEO_URL],
      platformAccountId: "chan_1",
      options: { youtube: { title: "My Short" } },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("YouTube");
  });
});

describe("youtubeAdapter.checkStatus", () => {
  const args = { accessToken: "yt-token", jobHandle: "vid_123", platformAccountId: "chan_1" };

  it("reports in_progress while YouTube is still processing the upload", async () => {
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("/youtube/v3/videos"),
        respond: () =>
          json({
            items: [
              {
                id: "vid_123",
                status: { uploadStatus: "uploaded" },
                processingDetails: { processingStatus: "processing" },
              },
            ],
          }),
      },
    ]));

    const result = await youtubeAdapter.checkStatus!(args);
    expect(result).toEqual({ status: "in_progress" });

    const fetchCall = calls.find((c) => c.url.includes("/youtube/v3/videos"))!;
    expect(fetchCall.url).toContain("id=vid_123");
    expect(fetchCall.url).toContain("part=status%2CprocessingDetails");
    expect((fetchCall.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer yt-token"
    );
  });

  it("reports published with the video id once processing succeeds", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/youtube/v3/videos"),
        respond: () =>
          json({
            items: [
              {
                id: "vid_123",
                status: { uploadStatus: "processed" },
                processingDetails: { processingStatus: "succeeded" },
              },
            ],
          }),
      },
    ]));

    const result = await youtubeAdapter.checkStatus!(args);
    expect(result).toEqual({ status: "published", platformPostId: "vid_123" });
  });

  it("reports failed with the rejection reason so the user can fix and retry", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/youtube/v3/videos"),
        respond: () =>
          json({
            items: [
              { id: "vid_123", status: { uploadStatus: "rejected", rejectionReason: "copyright" } },
            ],
          }),
      },
    ]));

    const result = await youtubeAdapter.checkStatus!(args);
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toContain("copyright");
  });

  it("reports failed when YouTube cannot process the video", async () => {
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("/youtube/v3/videos"),
        respond: () =>
          json({
            items: [
              {
                id: "vid_123",
                status: { uploadStatus: "uploaded" },
                processingDetails: { processingStatus: "failed" },
              },
            ],
          }),
      },
    ]));

    const result = await youtubeAdapter.checkStatus!(args);
    expect(result.status).toBe("failed");
  });
});

describe("youtubeAdapter.auth.authUrl", () => {
  it("builds the Google authorize URL requesting the youtube.upload scope offline", () => {
    if (youtubeAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    const url = youtubeAdapter.auth.authUrl({
      state: "st4te",
      callbackUrl: "https://app.example/oauth/callback/youtube",
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("accounts.google.com");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("st4te");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example/oauth/callback/youtube"
    );
    expect(parsed.searchParams.get("scope") ?? "").toContain("youtube.upload");
    // A refresh token is only returned with offline access + a forced consent.
    expect(parsed.searchParams.get("access_type")).toBe("offline");
  });
});

describe("youtubeAdapter.auth.exchangeCode", () => {
  it("exchanges code for tokens, then reads the channel for identity", async () => {
    if (youtubeAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("oauth2.googleapis.com/token"),
        respond: () =>
          json({ access_token: "acc-token", refresh_token: "ref-token", expires_in: 3600 }),
      },
      {
        match: (u) => u.includes("/youtube/v3/channels"),
        respond: () =>
          json({ items: [{ id: "chan_1", snippet: { title: "My Channel" } }] }),
      },
    ]));

    const result = await youtubeAdapter.auth.exchangeCode({
      code: "auth-code",
      callbackUrl: "https://app.example/oauth/callback/youtube",
    });

    const account = Array.isArray(result) ? result[0] : result;
    expect(account.platformAccountId).toBe("chan_1");
    expect(account.platformUsername).toBe("My Channel");
    expect(account.accessToken).toBe("acc-token");
    expect(account.refreshToken).toBe("ref-token");
    expect(account.tokenExpiresAt).toBeGreaterThan(Date.now());

    const channels = calls.find((c) => c.url.includes("/youtube/v3/channels"))!;
    expect(channels.url).toContain("mine=true");
    expect((channels.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer acc-token"
    );
  });

  it("propagates a failed code exchange as a thrown error", async () => {
    if (youtubeAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    ({ restore } = installFetchStub([
      {
        match: (u) => u.includes("oauth2.googleapis.com/token"),
        respond: () => new Response("bad code", { status: 400 }),
      },
    ]));

    await expect(
      youtubeAdapter.auth.exchangeCode({
        code: "bad",
        callbackUrl: "https://app.example/oauth/callback/youtube",
      })
    ).rejects.toThrow(/Google|YouTube/);
  });
});

describe("youtubeAdapter.auth.refreshToken", () => {
  it("refreshes via the refresh_token grant and keeps the existing refresh token", async () => {
    if (youtubeAdapter.auth.kind !== "oauth") throw new Error("expected oauth adapter");
    let calls: RecordedCall[];
    ({ calls, restore } = installFetchStub([
      {
        match: (u) => u.includes("oauth2.googleapis.com/token"),
        respond: () => json({ access_token: "new-acc", expires_in: 3600 }),
      },
    ]));

    const result = await youtubeAdapter.auth.refreshToken("old-ref");
    expect(result.accessToken).toBe("new-acc");
    // Google does not rotate the refresh token on refresh.
    expect(result.refreshToken).toBeUndefined();
    expect(result.expiresAt).toBeGreaterThan(Date.now());

    const body = String(calls.find((c) => c.url.includes("oauth2.googleapis.com/token"))!.init?.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-ref");
  });
});
