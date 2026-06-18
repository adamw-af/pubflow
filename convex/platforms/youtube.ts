import type {
  AuthUrlArgs,
  CheckStatusArgs,
  ExchangeArgs,
  PlatformAdapter,
  PublishPayload,
  PublishResult,
  PublishStatusResult,
  RefreshResult,
  TokenResult,
} from "./types";
import { PLATFORM_METADATA } from "./metadata";

// ---------------------------------------------------------------------------
// YouTube Shorts adapter — Data API v3 (ADR 0007), the second async Platform.
//
// Unlike TikTok's PULL_FROM_URL, YouTube has no pull source — the bytes must be
// uploaded to it. publishing is still asynchronous (ADR 0007):
//   1. publish() fetches the video bytes from the R2 URL server-side, then runs
//      a *resumable upload*: POST to open a session (videos.insert,
//      uploadType=resumable), read the session URI from the Location header,
//      then PUT the bytes. The PUT returns the new video resource with its id.
//   2. publish() returns the in-progress shape carrying that video id as the job
//      handle; the Publication stays in a durable `publishing` state.
//   3. The cron poll sweep later calls checkStatus(videoId), which GETs
//      videos.list?part=status,processingDetails until processing is terminal
//      (processed/succeeded → published, rejected/failed → failed with reason).
//
// An unverified Google app uploads are locked to `private` regardless of the
// requested privacy, and live public posting waits on the #15 Google
// verification — both are operator concerns noted in the PR.
// ---------------------------------------------------------------------------

const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";
const DATA_API = "https://www.googleapis.com/youtube/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ---------------------------------------------------------------------------
// Publish (resumable upload) — see ADR 0007
// ---------------------------------------------------------------------------

async function publish(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, options } = payload;

  if (mediaUrls.length === 0) {
    return { success: false, error: "YouTube requires a video to publish" };
  }

  const title = options?.youtube?.title?.trim();
  if (!title) {
    return { success: false, error: "YouTube requires a title to publish" };
  }

  // No pull-from-URL: pull the bytes from R2 server-side and upload them.
  const videoRes = await fetch(mediaUrls[0]);
  if (!videoRes.ok) {
    return { success: false, error: `YouTube upload failed: could not read the video (HTTP ${videoRes.status})` };
  }
  const contentType = videoRes.headers.get("Content-Type") ?? "video/*";
  const bytes = await videoRes.arrayBuffer();

  // Step 1: open a resumable upload session. `public` is the intent for a live
  // Short; an unverified app is forced to `private` by Google regardless (#15).
  const initRes = await fetch(`${UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(bytes.byteLength),
    },
    body: JSON.stringify({
      snippet: { title, description: caption },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  const sessionUri = initRes.headers.get("Location");
  if (!initRes.ok || !sessionUri) {
    return { success: false, error: `YouTube upload init failed: ${await reason(initRes)}` };
  }

  // Step 2: PUT the bytes to the session URI; the response is the video resource.
  const uploadRes = await fetch(sessionUri, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: bytes,
  });
  const json = await uploadRes.json().catch(() => null);
  if (!uploadRes.ok || !json?.id) {
    const detail = json?.error?.message ?? `HTTP ${uploadRes.status}`;
    return { success: false, error: `YouTube upload failed: ${detail}` };
  }

  return { success: true, inProgress: true, jobHandle: String(json.id) };
}

// ---------------------------------------------------------------------------
// Publish (poll) — see ADR 0007
// ---------------------------------------------------------------------------

async function checkStatus(args: CheckStatusArgs): Promise<PublishStatusResult> {
  const res = await fetch(
    `${DATA_API}/videos?` +
      new URLSearchParams({ part: "status,processingDetails", id: args.jobHandle }),
    { headers: { Authorization: `Bearer ${args.accessToken}` } }
  );

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    return { status: "failed", error: `YouTube status check failed: ${await reason(res)}` };
  }

  const item = json.items?.[0];
  if (!item) return { status: "failed", error: "YouTube could not find the uploaded video" };

  const status = item.status ?? {};
  const processing = item.processingDetails ?? {};

  if (status.uploadStatus === "rejected") {
    return {
      status: "failed",
      error: `YouTube rejected the video: ${status.rejectionReason ?? "unknown reason"}`,
    };
  }
  if (status.uploadStatus === "failed") {
    return {
      status: "failed",
      error: `YouTube rejected the video: ${status.failureReason ?? "unknown reason"}`,
    };
  }
  if (processing.processingStatus === "failed" || processing.processingStatus === "terminated") {
    return { status: "failed", error: "YouTube failed to process the video" };
  }
  if (status.uploadStatus === "processed" || processing.processingStatus === "succeeded") {
    return { status: "published", platformPostId: String(item.id) };
  }
  // uploaded + still processing — try again next sweep.
  return { status: "in_progress" };
}

async function reason(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      return JSON.parse(text)?.error?.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ---------------------------------------------------------------------------
// OAuth — Google OAuth 2.0
//
// Google identifies the app with client_id and authorizes on
// accounts.google.com, exchanging/refreshing tokens at oauth2.googleapis.com.
// A refresh token is only returned with access_type=offline + a forced consent
// prompt, and is *not* rotated on refresh (so refreshToken() returns none and
// the publisher keeps the stored one). `youtube.upload` permits uploading;
// `youtube.readonly` reads the channel identity + poll status.
// ---------------------------------------------------------------------------

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

function authUrl({ state, callbackUrl }: AuthUrlArgs): string {
  return (
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    })
  );
}

async function exchangeCode({ code, callbackUrl }: ExchangeArgs): Promise<TokenResult> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  // Resolve the channel identity for a human-facing handle.
  const chRes = await fetch(
    `${DATA_API}/channels?` + new URLSearchParams({ part: "snippet", mine: "true" }),
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!chRes.ok) throw new Error(`Failed to fetch YouTube channel: ${await chRes.text()}`);
  const channel = (await chRes.json()).items?.[0];
  if (!channel) throw new Error("No YouTube channel found for this Google account");

  return {
    platformAccountId: channel.id,
    platformUsername: channel.snippet?.title ?? channel.id,
    accessToken: access_token,
    refreshToken: refresh_token,
    tokenExpiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

async function refreshToken(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Google refresh failed: ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  // Google does not rotate the refresh token on refresh; the publisher keeps the
  // existing stored one (RefreshResult.refreshToken left undefined).
  return {
    accessToken: access_token,
    expiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const youtubeAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.youtube,
  auth: { kind: "oauth", authUrl, exchangeCode, refreshToken },
  publish,
  checkStatus,
};
