import type {
  AuthUrlArgs,
  CheckStatusArgs,
  ExchangeArgs,
  PlatformAdapter,
  PublishPayload,
  PublishResult,
  PublishStatusResult,
  RefreshResult,
  TikTokPrivacyLevel,
  TokenResult,
} from "./types";
import { PLATFORM_METADATA } from "./metadata";

// ---------------------------------------------------------------------------
// TikTok adapter — Content Posting API (Direct Post), the first async Platform
// (ADR 0007).
//
// Unlike the Meta Platforms, a TikTok video Post does not finish in one call:
//   1. publish() POSTs to /v2/post/publish/video/init/ with the R2 video URL as
//      a PULL_FROM_URL source. TikTok pulls and transcodes the bytes itself, so
//      no video bytes ever pass through this server. It returns a `publish_id`.
//   2. publish() returns the in-progress shape carrying that publish_id as the
//      job handle; the Publication stays in a durable `publishing` state.
//   3. The cron poll sweep later calls checkStatus(publish_id), which POSTs to
//      /v2/post/publish/status/fetch/ until the status is terminal
//      (PUBLISH_COMPLETE → published, FAILED → failed with the reason).
//
// PULL_FROM_URL requires the R2 public domain to be verified with TikTok, and
// an unaudited app may only publish with SELF_ONLY privacy — both are operator
// concerns noted in the PR (the #14 audit unblocks public posting).
// ---------------------------------------------------------------------------

const OPEN_API = "https://open.tiktokapis.com/v2";

// ---------------------------------------------------------------------------
// Publish (step 1: initiate) — see ADR 0007
// ---------------------------------------------------------------------------

async function publish(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, options } = payload;

  if (mediaUrls.length === 0) {
    return { success: false, error: "TikTok requires a video to publish" };
  }

  const tiktok = options?.tiktok;
  // Default to SELF_ONLY: the only privacy level an unaudited app may use, and
  // the safe choice when the composer did not supply explicit options.
  const privacyLevel: TikTokPrivacyLevel = tiktok?.privacyLevel ?? "SELF_ONLY";
  const disclose = tiktok?.disclosureEnabled ?? false;

  const body = {
    post_info: {
      title: caption,
      privacy_level: privacyLevel,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      brand_content_toggle: disclose ? tiktok?.brandedContent ?? false : false,
      brand_organic_toggle: disclose ? tiktok?.yourBrand ?? false : false,
    },
    source_info: {
      source: "PULL_FROM_URL",
      video_url: mediaUrls[0],
    },
  };

  const res = await fetch(`${OPEN_API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error?.code !== "ok" || !json?.data?.publish_id) {
    const reason = json?.error?.message ?? json?.error?.code ?? (await safeText(res));
    return { success: false, error: `TikTok publish init failed: ${reason}` };
  }

  return { success: true, inProgress: true, jobHandle: json.data.publish_id };
}

// ---------------------------------------------------------------------------
// Publish (step 2: poll) — see ADR 0007
// ---------------------------------------------------------------------------

async function checkStatus(args: CheckStatusArgs): Promise<PublishStatusResult> {
  const res = await fetch(`${OPEN_API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: args.jobHandle }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error?.code !== "ok") {
    const reason = json?.error?.message ?? json?.error?.code ?? (await safeText(res));
    return { status: "failed", error: `TikTok status check failed: ${reason}` };
  }

  const status: string = json.data?.status;
  if (status === "PUBLISH_COMPLETE") {
    const postId = json.data?.publicaly_available_post_id?.[0] ?? args.jobHandle;
    return { status: "published", platformPostId: String(postId) };
  }
  if (status === "FAILED") {
    return {
      status: "failed",
      error: `TikTok rejected the video: ${json.data?.fail_reason ?? "unknown reason"}`,
    };
  }
  // PROCESSING_DOWNLOAD / PROCESSING_UPLOAD / SEND_TO_USER_INBOX — still working.
  return { status: "in_progress" };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ---------------------------------------------------------------------------
// OAuth — TikTok Login Kit v2
//
// TikTok identifies the app with `client_key` (not client_id) and authorizes on
// tiktok.com, but exchanges/refreshes tokens at open.tiktokapis.com. The grant
// maps to one creator (open_id). `user.info.basic` reads the profile;
// `video.publish` permits Direct Post publishing.
// ---------------------------------------------------------------------------

const SCOPES = "user.info.basic,video.publish";

function authUrl({ state, callbackUrl }: AuthUrlArgs): string {
  return (
    `https://www.tiktok.com/v2/auth/authorize/?` +
    new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      scope: SCOPES,
      response_type: "code",
      redirect_uri: callbackUrl,
      state,
    })
  );
}

async function exchangeCode({ code, callbackUrl }: ExchangeArgs): Promise<TokenResult> {
  const tokenRes = await fetch(`${OPEN_API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl,
    }),
  });
  if (!tokenRes.ok) throw new Error(`TikTok token exchange failed: ${await tokenRes.text()}`);
  const { access_token, refresh_token, open_id, expires_in } = await tokenRes.json();

  // Read the profile for a human-facing handle. display_name is available with
  // user.info.basic; fall back to the open_id if it is somehow absent.
  const meRes = await fetch(
    `${OPEN_API}/user/info/?` + new URLSearchParams({ fields: "open_id,display_name" }),
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!meRes.ok) throw new Error(`Failed to fetch TikTok profile: ${await meRes.text()}`);
  const user = (await meRes.json()).data?.user ?? {};

  return {
    platformAccountId: open_id ?? user.open_id,
    platformUsername: user.display_name ?? open_id ?? "TikTok",
    accessToken: access_token,
    refreshToken: refresh_token,
    tokenExpiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

async function refreshToken(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch(`${OPEN_API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`TikTok refresh failed: ${await res.text()}`);
  const { access_token, refresh_token, expires_in } = await res.json();
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const tiktokAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.tiktok,
  auth: { kind: "oauth", authUrl, exchangeCode, refreshToken },
  publish,
  checkStatus,
};
