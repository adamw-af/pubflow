import { publishToInstagram } from "./instagram";
import { publishToLinkedIn } from "./linkedin";
import { publishToX } from "./x";
import type { PublishPayload, PublishResult } from "./types";

export type { PublishPayload, PublishResult };

export async function publishToplatform(
  platform: "linkedin" | "instagram" | "x",
  payload: PublishPayload & { platformAccountId: string }
): Promise<PublishResult> {
  switch (platform) {
    case "linkedin":
      return publishToLinkedIn(payload);
    case "instagram":
      return publishToInstagram(payload);
    case "x":
      return publishToX(payload);
  }
}
