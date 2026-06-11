import type { PublishPayload, PublishResult } from "./types";

// Instagram Graph API requires media for every post.
// accessToken here is the Page Access Token obtained during OAuth.
// platformAccountId is the Instagram Business Account ID.

export async function publishToInstagram(
  payload: PublishPayload & { platformAccountId: string }
): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls, platformAccountId } = payload;

  if (mediaUrls.length === 0) {
    return {
      success: false,
      error:
        "Instagram requires at least one image or video. Add media to this post.",
    };
  }

  const igUserId = platformAccountId;

  // Single image post
  if (mediaUrls.length === 1) {
    return publishSingleMedia(accessToken, igUserId, caption, mediaUrls[0]);
  }

  // Carousel post (2-10 media items)
  return publishCarousel(accessToken, igUserId, caption, mediaUrls.slice(0, 10));
}

async function publishSingleMedia(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrl: string
): Promise<PublishResult> {
  const isVideo = /\.(mp4|mov|avi)$/i.test(mediaUrl);

  // Step 1: Create media container
  const params: Record<string, string> = {
    caption,
    access_token: accessToken,
  };
  if (isVideo) {
    params.media_type = "REELS";
    params.video_url = mediaUrl;
  } else {
    params.image_url = mediaUrl;
  }

  const createRes = await fetch(
    `https://graph.instagram.com/v21.0/me/media?` +
      new URLSearchParams(params),
    { method: "POST" }
  );

  if (!createRes.ok) {
    const err = await createRes.text();
    return { success: false, error: `Instagram container error: ${err}` };
  }
  const { id: creationId } = await createRes.json();

  // For videos, wait for processing
  if (isVideo) {
    const ready = await waitForVideoProcessing(accessToken, creationId);
    if (!ready) {
      return { success: false, error: "Instagram video processing timed out" };
    }
  }

  // Step 2: Publish
  return publishContainer(accessToken, igUserId, creationId);
}

async function publishCarousel(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrls: string[]
): Promise<PublishResult> {
  // Create a container for each media item
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
      `https://graph.instagram.com/v21.0/me/media?` +
        new URLSearchParams(params),
      { method: "POST" }
    );
    if (!res.ok) continue;
    const { id } = await res.json();
    itemIds.push(id);
  }

  if (itemIds.length < 2) {
    return { success: false, error: "Instagram carousel requires at least 2 media items" };
  }

  // Create carousel container
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
      new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      }),
    { method: "POST" }
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Instagram publish error: ${err}` };
  }
  const { id } = await res.json();
  return { success: true, platformPostId: id };
}

async function waitForVideoProcessing(
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
