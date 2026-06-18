import type {
  CredentialConnectArgs,
  PlatformAdapter,
  PublishPayload,
  PublishResult,
  RefreshResult,
  TokenResult,
} from "./types";
import { PLATFORM_METADATA } from "./metadata";

// ---------------------------------------------------------------------------
// Bluesky adapter — AT Protocol (ADR 0006)
//
// Unlike the redirect-OAuth platforms, Bluesky authenticates with an app
// password: the user submits their handle + app password and we exchange them
// for a session (`createSession`) in one call — no redirect. Sessions are
// refreshed with the refresh JWT (`refreshSession`). Publishing creates an
// `app.bsky.feed.post` record; images are uploaded as blobs first and embedded.
//
// All XRPC calls go to the public entryway host; app passwords are scoped to it.
// ---------------------------------------------------------------------------

const XRPC = "https://bsky.social/xrpc";

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

async function publish(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, platformAccountId } = payload;

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: caption,
    createdAt: new Date().toISOString(),
  };

  // Upload any images as blobs and embed them (Bluesky accepts up to 4 images).
  const images: { alt: string; image: unknown }[] = [];
  for (const mediaUrl of mediaUrls.slice(0, 4)) {
    const blob = await uploadBlob(accessToken, mediaUrl);
    if (blob) images.push({ alt: "", image: blob });
  }
  if (images.length > 0) {
    record.embed = { $type: "app.bsky.embed.images", images };
  }

  const res = await fetch(`${XRPC}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      repo: platformAccountId,
      collection: "app.bsky.feed.post",
      record,
    }),
  });

  if (!res.ok) {
    return { success: false, error: `Bluesky API error: ${await res.text()}` };
  }

  const data = await res.json();
  return { success: true, platformPostId: data.uri };
}

async function uploadBlob(accessToken: string, mediaUrl: string): Promise<unknown | null> {
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) return null;

  const bytes = await mediaRes.arrayBuffer();
  const contentType = mediaRes.headers.get("content-type") ?? "image/jpeg";

  const res = await fetch(`${XRPC}/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body: bytes,
  });
  if (!res.ok) return null;

  const { blob } = await res.json();
  return blob ?? null;
}

// ---------------------------------------------------------------------------
// Auth (app password / session)
// ---------------------------------------------------------------------------

async function connect({ credentials }: CredentialConnectArgs): Promise<TokenResult> {
  const res = await fetch(`${XRPC}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: credentials.identifier,
      password: credentials.appPassword,
    }),
  });

  if (!res.ok) throw new Error(`Bluesky sign-in failed: ${await res.text()}`);
  const session = await res.json();

  return {
    platformAccountId: session.did,
    platformUsername: session.handle,
    accessToken: session.accessJwt,
    refreshToken: session.refreshJwt,
    // The access JWT is short-lived (~2h); surface its expiry so the publisher
    // can refresh just-in-time for Posts scheduled further out.
    tokenExpiresAt: jwtExpiryMs(session.accessJwt),
  };
}

/** Read the `exp` claim (seconds) from a JWT and return it in ms, if present. */
function jwtExpiryMs(jwt: string): number | undefined {
  const payload = jwt?.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json).exp;
    return typeof exp === "number" ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function refreshToken(refreshJwt: string): Promise<RefreshResult> {
  const res = await fetch(`${XRPC}/com.atproto.server.refreshSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${refreshJwt}` },
  });
  if (!res.ok) throw new Error(`Bluesky session refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.accessJwt,
    refreshToken: data.refreshJwt,
    expiresAt: jwtExpiryMs(data.accessJwt),
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const blueskyAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.bluesky,
  auth: {
    kind: "credentials",
    // The connect form's fields are pure data — kept in metadata so the browser
    // can render the form without importing this server-only adapter module.
    fields: PLATFORM_METADATA.bluesky.credentialFields ?? [],
    connect,
    refreshToken,
  },
  publish,
};
