import type {
  AuthUrlArgs,
  ExchangeArgs,
  PlatformAdapter,
  PublishPayload,
  PublishResult,
  RefreshResult,
  TokenResult,
} from "./types";
import { PLATFORM_METADATA } from "./metadata";

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

async function publish(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls } = payload;

  const mediaIds: string[] = [];

  // Upload media if present (uses v1.1 media upload API — still required for media)
  for (const mediaUrl of mediaUrls.slice(0, 4)) {
    const mediaId = await uploadMedia(accessToken, mediaUrl);
    if (mediaId) mediaIds.push(mediaId);
  }

  const body: any = { text: caption };
  if (mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `X API error: ${err}` };
  }

  const data = await res.json();
  return { success: true, platformPostId: data.data?.id };
}

async function uploadMedia(accessToken: string, mediaUrl: string): Promise<string | null> {
  // Fetch media bytes from R2
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) return null;

  const mediaBytes = await mediaRes.arrayBuffer();
  const contentType = mediaRes.headers.get("content-type") ?? "image/jpeg";
  const totalBytes = mediaBytes.byteLength;

  // X v1.1 INIT
  const initRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      command: "INIT",
      total_bytes: String(totalBytes),
      media_type: contentType,
    }),
  });
  if (!initRes.ok) return null;
  const { media_id_string } = await initRes.json();

  // X v1.1 APPEND (single chunk — fine for images up to ~5MB)
  const appendForm = new FormData();
  appendForm.append("command", "APPEND");
  appendForm.append("media_id", media_id_string);
  appendForm.append("segment_index", "0");
  appendForm.append("media", new Blob([mediaBytes], { type: contentType }));

  const appendRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: appendForm,
  });
  if (!appendRes.ok) return null;

  // X v1.1 FINALIZE
  const finalizeRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ command: "FINALIZE", media_id: media_id_string }),
  });
  if (!finalizeRes.ok) return null;

  return media_id_string;
}

// ---------------------------------------------------------------------------
// OAuth (PKCE)
// ---------------------------------------------------------------------------

function authUrl({ state, callbackUrl, codeChallenge }: AuthUrlArgs): string {
  return (
    `https://x.com/i/oauth2/authorize?` +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.X_CLIENT_ID!,
      redirect_uri: callbackUrl,
      state,
      scope: "tweet.read tweet.write users.read offline.access",
      code_challenge: codeChallenge!,
      code_challenge_method: "S256",
    })
  );
}

async function exchangeCode({ code, codeVerifier, callbackUrl }: ExchangeArgs): Promise<TokenResult> {
  const credentials = btoa(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`);

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier!,
    }),
  });

  if (!tokenRes.ok) throw new Error(`X token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();

  const userRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) throw new Error("Failed to fetch X user info");
  const { data: xUser } = await userRes.json();

  return {
    platformAccountId: xUser.id,
    platformUsername: xUser.username,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  };
}

async function refreshToken(refreshToken: string): Promise<RefreshResult> {
  const credentials = btoa(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`);
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`X refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const xAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.x,
  auth: { kind: "oauth", usesPKCE: true, authUrl, exchangeCode, refreshToken },
  publish,
};
