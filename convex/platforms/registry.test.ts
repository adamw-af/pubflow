import { describe, expect, it } from "vitest";
import {
  PLATFORM_IDS,
  adapters,
  getAdapter,
  platformMetadata,
} from "./registry";

describe("platform registry", () => {
  it("registers the v1 platforms plus Bluesky, Facebook, Threads, TikTok and YouTube", () => {
    expect([...PLATFORM_IDS].sort()).toEqual([
      "bluesky",
      "facebook",
      "instagram",
      "linkedin",
      "threads",
      "tiktok",
      "x",
      "youtube",
    ]);
  });

  it("resolves an adapter by id", () => {
    expect(getAdapter("linkedin").displayName).toBe("LinkedIn");
    expect(getAdapter("x").id).toBe("x");
    expect(getAdapter("bluesky").displayName).toBe("Bluesky");
    expect(getAdapter("facebook").displayName).toBe("Facebook");
    expect(getAdapter("threads").displayName).toBe("Threads");
    expect(getAdapter("tiktok").displayName).toBe("TikTok");
    expect(getAdapter("youtube").displayName).toBe("YouTube");
  });

  it("exposes checkStatus only on the async (video) platforms", () => {
    // TikTok and YouTube publish asynchronously (ADR 0007), so they implement
    // the poll hook; the sync Meta/AT-Protocol platforms finish in one call.
    expect(typeof getAdapter("tiktok").checkStatus).toBe("function");
    expect(typeof getAdapter("youtube").checkStatus).toBe("function");
    expect(getAdapter("threads").checkStatus).toBeUndefined();
    expect(getAdapter("bluesky").checkStatus).toBeUndefined();
  });

  it("throws for an unknown platform id", () => {
    expect(() => getAdapter("pinterest")).toThrow();
  });

  it("derives frontend metadata (id, displayName, icon, capability) from the adapters", () => {
    const linkedin = platformMetadata.find((m) => m.id === "linkedin")!;
    expect(linkedin).toMatchObject({
      id: "linkedin",
      displayName: "LinkedIn",
      icon: "linkedin",
    });
    expect(linkedin.capability.maxCaptionLength).toBe(3000);
    // metadata must not leak the publish/oauth behaviour
    expect(linkedin).not.toHaveProperty("publish");
    expect(linkedin).not.toHaveProperty("oauth");
  });

  it("keeps every id in sync with its adapter's own id field", () => {
    for (const id of PLATFORM_IDS) {
      expect(adapters[id].id).toBe(id);
    }
  });
});
