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

// Instagram Graph API requires media for every post.
// accessToken here is the Page Access Token obtained during OAuth.
// platformAccountId is the Instagram Business Account ID.

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

async function publish(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, platformAccountId } = payload;

  if (mediaUrls.length === 0) {
    return {
      success: false,
      error: "Instagram requires at least one image or video. Add media to this post.",
    };
  }

  const igUserId = platformAccountId;

  if (mediaUrls.length === 1) {
    return publishSingleMedia(accessToken, igUserId, caption, mediaUrls[0]);
  }

  return publishCarousel(accessToken, igUserId, caption, mediaUrls.slice(0, 10));
}

async function publishSingleMedia(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrl: string
): Promise<PublishResult> {
  const isVideo = /\.(mp4|mov|avi)$/i.test(mediaUrl);

  const params: Record<string, string> = { caption, access_token: accessToken };
  if (isVideo) {
    params.media_type = "REELS";
    params.video_url = mediaUrl;
  } else {
    params.image_url = mediaUrl;
  }

  const createRes = await fetch(
    `https://graph.instagram.com/v21.0/me/media?` + new URLSearchParams(params),
    { method: "POST" }
  );

  if (!createRes.ok) {
    const err = await createRes.text();
    return { success: false, error: `Instagram container error: ${err}` };
  }
  const { id: creationId } = await createRes.json();

  const ready = await waitForContainerReady(accessToken, creationId);
  if (!ready) {
    return {
      success: false,
      error: isVideo
        ? "Instagram video processing timed out"
        : "Instagram image processing timed out",
    };
  }

  return publishContainer(accessToken, igUserId, creationId);
}

async function publishCarousel(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrls: string[]
): Promise<PublishResult> {
  const itemIds: string[] = [];

  for (const url of mediaUrls) {
    const isVideo = /\.(mp4|mov|avi)$/i.test(url);
    const params: Record<string, string> = {
      is_carousel_item: "true",
      access_token: accessToken,
    };
    if (isVideo) {
      params.media_type = "VIDEO";
      params.video_url = url;
    } else {
      params.image_url = url;
    }

    const res = await fetch(
      `https://graph.instagram.com/v21.0/me/media?` + new URLSearchParams(params),
      { method: "POST" }
    );
    if (!res.ok) continue;
    const { id } = await res.json();
    itemIds.push(id);
  }

  if (itemIds.length < 2) {
    return { success: false, error: "Instagram carousel requires at least 2 media items" };
  }

  const carouselRes = await fetch(
    `https://graph.instagram.com/v21.0/me/media?` +
      new URLSearchParams({
        media_type: "CAROUSEL",
        children: itemIds.join(","),
        caption,
        access_token: accessToken,
      }),
    { method: "POST" }
  );

  if (!carouselRes.ok) {
    const err = await carouselRes.text();
    return { success: false, error: `Instagram carousel error: ${err}` };
  }
  const { id: creationId } = await carouselRes.json();

  return publishContainer(accessToken, igUserId, creationId);
}

async function publishContainer(
  accessToken: string,
  igUserId: string,
  creationId: string
): Promise<PublishResult> {
  const res = await fetch(
    `https://graph.instagram.com/v21.0/me/media_publish?` +
      new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
    { method: "POST" }
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Instagram publish error: ${err}` };
  }
  const { id } = await res.json();
  return { success: true, platformPostId: id };
}

async function waitForContainerReady(
  accessToken: string,
  creationId: string,
  maxAttempts = 10
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const res = await fetch(
      `https://graph.instagram.com/v21.0/${creationId}?fields=status_code&access_token=${accessToken}`
    );
    if (!res.ok) continue;

    const { status_code } = await res.json();
    if (status_code === "FINISHED") return true;
    if (status_code === "ERROR") return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

function authUrl({ state, callbackUrl }: AuthUrlArgs): string {
  return (
    `https://www.instagram.com/oauth/authorize?` +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.FACEBOOK_APP_ID!,
      redirect_uri: callbackUrl,
      state,
      scope: "instagram_business_basic,instagram_business_content_publish",
    })
  );
}

async function exchangeCode({ code, callbackUrl }: ExchangeArgs): Promise<TokenResult> {
  // Step 1: Exchange code for short-lived token
  const shortTokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl,
      code,
    }),
  });
  if (!shortTokenRes.ok)
    throw new Error(`Instagram token exchange failed: ${await shortTokenRes.text()}`);
  const { access_token: shortToken, user_id } = await shortTokenRes.json();

  // Step 2: Exchange for long-lived token (60 days)
  const longTokenRes = await fetch(
    `https://graph.instagram.com/access_token?` +
      new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        access_token: shortToken,
      })
  );
  if (!longTokenRes.ok) throw new Error("Failed to exchange for long-lived Instagram token");
  const { access_token: longToken, expires_in } = await longTokenRes.json();

  // Step 3: Get id and username
  const userRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${longToken}`
  );
  const igUser = userRes.ok ? await userRes.json() : {};

  return {
    platformAccountId: igUser.id ?? String(user_id),
    platformUsername: igUser.username ?? String(user_id),
    accessToken: longToken,
    tokenExpiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
  };
}

async function refreshToken(refreshToken: string): Promise<RefreshResult> {
  // Instagram long-lived tokens are refreshed via ig_refresh_token using the
  // access token itself. (Instagram accounts do not store a separate refresh
  // token, so the token-refresh sweep does not reach this path today.)
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?` +
      new URLSearchParams({ grant_type: "ig_refresh_token", access_token: refreshToken })
  );
  if (!res.ok) throw new Error(`Instagram refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const instagramAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.instagram,
  auth: { kind: "oauth", authUrl, exchangeCode, refreshToken },
  publish,
};
