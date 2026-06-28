import type {
  AuthUrlArgs,
  ExchangeArgs,
  PlatformAdapter,
  PublishPayload,
  PublishResult,
  TokenResult,
} from "./types";
import { PLATFORM_METADATA } from "./metadata";

// ---------------------------------------------------------------------------
// Facebook (Pages) adapter — Meta Graph API (ADR 0006)
//
// Publishing is a Page action performed with that Page's own access token (not
// the user token): text/link posts go to POST /{page-id}/feed; image posts go
// to POST /{page-id}/photos. `platformAccountId` is the Page id and
// `accessToken` is the Page access token resolved during connect.
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

async function publish(payload: PublishPayload): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, platformAccountId } = payload;

  if (mediaUrls.length === 0) {
    return publishFeed(accessToken, platformAccountId, caption);
  }

  if (mediaUrls.length === 1) {
    return publishPhoto(accessToken, platformAccountId, caption, mediaUrls[0]);
  }

  return publishGallery(
    accessToken,
    platformAccountId,
    caption,
    mediaUrls.slice(0, PLATFORM_METADATA.facebook.capability.maxMediaCount)
  );
}

async function publishGallery(
  accessToken: string,
  pageId: string,
  message: string,
  mediaUrls: string[]
): Promise<PublishResult> {
  // Upload each photo unpublished, then create one feed post that attaches them.
  const mediaFbids: string[] = [];
  for (const url of mediaUrls) {
    const res = await fetch(
      `${GRAPH}/${pageId}/photos?` +
        new URLSearchParams({ url, published: "false", access_token: accessToken }),
      { method: "POST" }
    );
    if (!res.ok) {
      return { success: false, error: `Facebook photo error: ${await res.text()}` };
    }
    const { id } = await res.json();
    mediaFbids.push(id);
  }

  const params = new URLSearchParams({ message, access_token: accessToken });
  mediaFbids.forEach((id, i) => {
    params.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }));
  });

  const res = await fetch(`${GRAPH}/${pageId}/feed?` + params, { method: "POST" });
  if (!res.ok) {
    return { success: false, error: `Facebook feed error: ${await res.text()}` };
  }
  const { id } = await res.json();
  return { success: true, platformPostId: id };
}

async function publishPhoto(
  accessToken: string,
  pageId: string,
  caption: string,
  mediaUrl: string
): Promise<PublishResult> {
  const res = await fetch(
    `${GRAPH}/${pageId}/photos?` +
      new URLSearchParams({ url: mediaUrl, caption, access_token: accessToken }),
    { method: "POST" }
  );

  if (!res.ok) {
    return { success: false, error: `Facebook photo error: ${await res.text()}` };
  }
  const { id, post_id } = await res.json();
  return { success: true, platformPostId: post_id ?? id };
}

async function publishFeed(
  accessToken: string,
  pageId: string,
  message: string
): Promise<PublishResult> {
  const res = await fetch(
    `${GRAPH}/${pageId}/feed?` +
      new URLSearchParams({ message, access_token: accessToken }),
    { method: "POST" }
  );

  if (!res.ok) {
    return { success: false, error: `Facebook feed error: ${await res.text()}` };
  }
  const { id } = await res.json();
  return { success: true, platformPostId: id };
}

// ---------------------------------------------------------------------------
// OAuth
//
// Facebook Login grants a user token; we then list the Pages the user
// administers (each carries its own long-lived Page access token) and connect
// each as a Social Account. `pages_show_list` lets us read /me/accounts;
// `pages_manage_posts` lets us publish; `pages_read_engagement` is required
// alongside publish.
// ---------------------------------------------------------------------------

// Facebook Login for Business doesn't take a `scope` param; the requested
// permissions (pages_show_list, pages_manage_posts, pages_read_engagement) live
// in a reusable login *configuration* created in the App Dashboard, referenced
// here by its id (FACEBOOK_LOGIN_CONFIG_ID). The configuration must issue a
// *user* access token so the /me/accounts call below returns the admin's Pages.
function authUrl({ state, callbackUrl }: AuthUrlArgs): string {
  return (
    `https://www.facebook.com/v21.0/dialog/oauth?` +
    new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      config_id: process.env.FACEBOOK_LOGIN_CONFIG_ID!,
      redirect_uri: callbackUrl,
      state,
      response_type: "code",
      // Required with FB Login for Business when we ask for a `code` response
      // alongside `config_id`; without it the dialog errors out.
      override_default_response_type: "true",
    })
  );
}

async function exchangeCode({ code, callbackUrl }: ExchangeArgs): Promise<TokenResult[]> {
  // Step 1: code -> short-lived user token.
  const shortRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        redirect_uri: callbackUrl,
        code,
      })
  );
  if (!shortRes.ok)
    throw new Error(`Facebook token exchange failed: ${await shortRes.text()}`);
  const { access_token: shortToken } = await shortRes.json();

  // Step 2: short-lived -> long-lived user token (~60 days). Page tokens minted
  // from a long-lived user token are themselves long-lived (no expiry).
  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        fb_exchange_token: shortToken,
      })
  );
  if (!longRes.ok)
    throw new Error("Failed to exchange for long-lived Facebook token");
  const { access_token: longToken } = await longRes.json();

  // Step 3: list the Pages the user administers — one Social Account each.
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?` + new URLSearchParams({ access_token: longToken })
  );
  if (!pagesRes.ok)
    throw new Error(`Failed to list Facebook Pages: ${await pagesRes.text()}`);
  const { data } = await pagesRes.json();
  const pages: Array<{ id: string; name: string; access_token: string }> = data ?? [];

  return pages.map((page) => ({
    platformAccountId: page.id,
    platformUsername: page.name,
    accessToken: page.access_token,
  }));
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const facebookAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.facebook,
  auth: {
    kind: "oauth",
    authUrl,
    exchangeCode,
    // Page tokens minted from a long-lived user token do not expire and have no
    // refresh token, so the refresh sweep never reaches this path. Throw to make
    // an unexpected call loud rather than silently returning a stale token.
    refreshToken: async () => {
      throw new Error("Facebook Page access tokens are long-lived and are not refreshed");
    },
  },
  publish,
};
