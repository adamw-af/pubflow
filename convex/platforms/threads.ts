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
// Threads adapter — Meta's Threads Graph API (ADR 0006)
//
// Threads publishing is a two-step dance against the same Graph-style API as
// Facebook but a different host: first create a *media container* at
// POST /{threads-user-id}/threads (TEXT, IMAGE, or a CAROUSEL of image
// containers), then publish it at POST /{threads-user-id}/threads_publish with
// the returned creation_id. `platformAccountId` is the Threads user id and
// `accessToken` is that user's long-lived Threads token resolved during connect.
//
// Video is not handled here yet: it reuses the async `publishing` pipeline
// (ADR 0007, Wave 2), and the capability marks videoSupported: false so the
// composer rejects it before it reaches publish.
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.threads.net/v1.0";

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

async function publish(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, platformAccountId } = payload;

  if (mediaUrls.length === 0) {
    return publishText(accessToken, platformAccountId, caption);
  }

  if (mediaUrls.length === 1) {
    return publishImage(accessToken, platformAccountId, caption, mediaUrls[0]);
  }

  return publishCarousel(
    accessToken,
    platformAccountId,
    caption,
    mediaUrls.slice(0, PLATFORM_METADATA.threads.capability.maxMediaCount)
  );
}

/** Create a media container; returns its creation id or an error result. */
async function createContainer(
  userId: string,
  params: URLSearchParams
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${GRAPH}/${userId}/threads?` + params, { method: "POST" });
  if (!res.ok) return { error: `Threads container error: ${await res.text()}` };
  const { id } = await res.json();
  return { id };
}

/** Publish a previously-created container by its creation id. */
async function publishContainer(
  accessToken: string,
  userId: string,
  creationId: string
): Promise<PublishResult> {
  const res = await fetch(
    `${GRAPH}/${userId}/threads_publish?` +
      new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
    { method: "POST" }
  );
  if (!res.ok) {
    return { success: false, error: `Threads publish error: ${await res.text()}` };
  }
  const { id } = await res.json();
  return { success: true, platformPostId: id };
}

async function publishText(
  accessToken: string,
  userId: string,
  text: string
): Promise<PublishResult> {
  const container = await createContainer(
    userId,
    new URLSearchParams({ media_type: "TEXT", text, access_token: accessToken })
  );
  if ("error" in container) return { success: false, error: container.error };
  return publishContainer(accessToken, userId, container.id);
}

async function publishImage(
  accessToken: string,
  userId: string,
  caption: string,
  mediaUrl: string
): Promise<PublishResult> {
  const container = await createContainer(
    userId,
    new URLSearchParams({
      media_type: "IMAGE",
      image_url: mediaUrl,
      text: caption,
      access_token: accessToken,
    })
  );
  if ("error" in container) return { success: false, error: container.error };
  return publishContainer(accessToken, userId, container.id);
}

async function publishCarousel(
  accessToken: string,
  userId: string,
  caption: string,
  mediaUrls: string[]
): Promise<PublishResult> {
  // Each image becomes an unpublished carousel-item container; the parent
  // CAROUSEL container then references them by id and carries the caption.
  const childIds: string[] = [];
  for (const url of mediaUrls) {
    const child = await createContainer(
      userId,
      new URLSearchParams({
        media_type: "IMAGE",
        image_url: url,
        is_carousel_item: "true",
        access_token: accessToken,
      })
    );
    if ("error" in child) return { success: false, error: child.error };
    childIds.push(child.id);
  }

  const parent = await createContainer(
    userId,
    new URLSearchParams({
      media_type: "CAROUSEL",
      children: childIds.join(","),
      text: caption,
      access_token: accessToken,
    })
  );
  if ("error" in parent) return { success: false, error: parent.error };
  return publishContainer(accessToken, userId, parent.id);
}

// ---------------------------------------------------------------------------
// OAuth
//
// Threads has its own OAuth app (THREADS_APP_ID/SECRET), distinct from the
// Facebook Pages app, and its own authorize host (threads.net). The grant maps
// to one Threads user. We exchange the code for a short-lived token, upgrade it
// to a long-lived (~60-day) token, then read the profile for the username. The
// `threads_basic` scope reads the profile; `threads_content_publish` permits
// publishing.
// ---------------------------------------------------------------------------

const SCOPES = "threads_basic,threads_content_publish";

function authUrl({ state, callbackUrl }: AuthUrlArgs): string {
  return (
    `https://threads.net/oauth/authorize?` +
    new URLSearchParams({
      client_id: process.env.THREADS_APP_ID!,
      redirect_uri: callbackUrl,
      state,
      response_type: "code",
      scope: SCOPES,
    })
  );
}

async function exchangeCode({ code, callbackUrl }: ExchangeArgs): Promise<TokenResult> {
  // Step 1: code -> short-lived user token (+ the Threads user id).
  const shortRes = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.THREADS_APP_ID!,
      client_secret: process.env.THREADS_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl,
      code,
    }),
  });
  if (!shortRes.ok)
    throw new Error(`Threads token exchange failed: ${await shortRes.text()}`);
  const { access_token: shortToken } = await shortRes.json();

  // Step 2: short-lived -> long-lived token (~60 days, refreshable).
  const longRes = await fetch(
    `https://graph.threads.net/access_token?` +
      new URLSearchParams({
        grant_type: "th_exchange_token",
        client_secret: process.env.THREADS_APP_SECRET!,
        access_token: shortToken,
      })
  );
  if (!longRes.ok)
    throw new Error("Failed to exchange for long-lived Threads token");
  const { access_token: longToken, expires_in } = await longRes.json();

  // Step 3: read the profile for the account id + username.
  const meRes = await fetch(
    `${GRAPH}/me?` +
      new URLSearchParams({ fields: "id,username", access_token: longToken })
  );
  if (!meRes.ok) throw new Error(`Failed to fetch Threads profile: ${await meRes.text()}`);
  const { id, username } = await meRes.json();

  return {
    platformAccountId: id,
    platformUsername: username,
    accessToken: longToken,
    refreshToken: longToken,
    tokenExpiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

async function refreshToken(refreshToken: string): Promise<RefreshResult> {
  // Threads long-lived tokens are refreshed by presenting the current token
  // itself (there is no separate refresh credential), extending it ~60 days.
  const res = await fetch(
    `https://graph.threads.net/refresh_access_token?` +
      new URLSearchParams({
        grant_type: "th_refresh_token",
        access_token: refreshToken,
      })
  );
  if (!res.ok) throw new Error(`Threads refresh failed: ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  return {
    accessToken: access_token,
    refreshToken: access_token,
    expiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const threadsAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.threads,
  auth: { kind: "oauth", authUrl, exchangeCode, refreshToken },
  publish,
};
