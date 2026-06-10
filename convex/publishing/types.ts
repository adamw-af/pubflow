export type PublishPayload = {
  accessToken: string;
  caption: string;
  mediaUrls: string[]; // public CDN URLs of media items
};

export type PublishResult =
  | { success: true; platformPostId: string }
  | { success: false; error: string };
