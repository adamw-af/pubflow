import type { PublishPayload, PublishResult } from "./types";

export async function publishToX(
  payload: PublishPayload
): Promise<PublishResult> {
  const { accessToken, caption, mediaUrls } = payload;

  const mediaIds: string[] = [];

  // Upload media if present (uses v1.1 media upload API — still required for media)
  for (const mediaUrl of mediaUrls.slice(0, 4)) {
    const mediaId = await uploadXMedia(accessToken, mediaUrl);
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

async function uploadXMedia(
  accessToken: string,
  mediaUrl: string
): Promise<string | null> {
  // Fetch media bytes from R2
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) return null;

  const mediaBytes = await mediaRes.arrayBuffer();
  const contentType = mediaRes.headers.get("content-type") ?? "image/jpeg";
  const totalBytes = mediaBytes.byteLength;

  // X v1.1 INIT
  const initForm = new URLSearchParams({
    command: "INIT",
    total_bytes: String(totalBytes),
    media_type: contentType,
  });

  const initRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: initForm,
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
  const finalizeForm = new URLSearchParams({
    command: "FINALIZE",
    media_id: media_id_string,
  });

  const finalizeRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: finalizeForm,
  });
  if (!finalizeRes.ok) return null;

  return media_id_string;
}
