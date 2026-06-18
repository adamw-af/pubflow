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

  // Fetch the member URN from LinkedIn userinfo
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    return { success: false, error: "Failed to fetch LinkedIn profile" };
  }
  const profile = await profileRes.json();
  const authorUrn = `urn:li:person:${profile.sub}`;

  let shareMediaCategory = "NONE";
  const media: any[] = [];

  // Upload images if present
  for (const imageUrl of mediaUrls.slice(0, 9)) {
    const assetResult = await uploadImage(accessToken, authorUrn, imageUrl);
    if (!assetResult) continue;
    media.push({ status: "READY", media: assetResult });
    shareMediaCategory = "IMAGE";
  }

  const body: any = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: caption },
        shareMediaCategory,
        ...(media.length > 0 ? { media } : {}),
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `LinkedIn API error: ${err}` };
  }

  const data = await res.json();
  return { success: true, platformPostId: data.id };
}

async function uploadImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string
): Promise<string | null> {
  // Step 1: Register upload
  const registerRes = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: authorUrn,
          serviceRelationships: [
            { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
          ],
        },
      }),
    }
  );

  if (!registerRes.ok) return null;
  const registerData = await registerRes.json();

  const uploadUrl =
    registerData.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  const assetUrn = registerData.value?.asset;

  if (!uploadUrl || !assetUrn) return null;

  // Step 2: Fetch image bytes from R2 and upload to LinkedIn
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) return null;
  const imageBytes = await imageRes.arrayBuffer();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/jpeg" },
    body: imageBytes,
  });

  if (!uploadRes.ok) return null;
  return assetUrn;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

function authUrl({ state, callbackUrl }: AuthUrlArgs): string {
  return (
    `https://www.linkedin.com/oauth/v2/authorization?` +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      redirect_uri: callbackUrl,
      state,
      scope: "w_member_social openid profile email",
    })
  );
}

async function exchangeCode({ code, callbackUrl }: ExchangeArgs): Promise<TokenResult> {
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });

  if (!tokenRes.ok) throw new Error(`LinkedIn token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();

  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error("Failed to fetch LinkedIn profile");
  const profile = await profileRes.json();

  return {
    platformAccountId: profile.sub,
    platformUsername: profile.name ?? profile.email ?? profile.sub,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  };
}

async function refreshToken(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn refresh failed: ${await res.text()}`);
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

export const linkedinAdapter: PlatformAdapter = {
  ...PLATFORM_METADATA.linkedin,
  auth: { kind: "oauth", authUrl, exchangeCode, refreshToken },
  publish,
};
