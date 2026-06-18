import { describe, expect, it } from "vitest";
import { PLATFORM_IDS, getPlatformMetadata, platformMetadata } from "./metadata";
import { validateAgainstCapability } from "./capabilityValidation";

// metadata.ts is the browser-safe projection of the registry: the connect UI
// and composer derive their platform list, labels and limits from here, so a
// new platform never needs a scattered frontend edit (ADR 0006).

describe("platform metadata (browser-safe registry projection)", () => {
  it("exposes the caption + media limits the composer enforces, per platform", () => {
    expect(getPlatformMetadata("linkedin").capability.maxCaptionLength).toBe(3000);
    expect(getPlatformMetadata("instagram").capability.maxCaptionLength).toBe(2200);
    expect(getPlatformMetadata("x").capability.maxCaptionLength).toBe(280);

    // LinkedIn's real feed limit is 9 images (the publish path slices to 9);
    // the UI must agree with the adapter, not the old hardcoded 10.
    expect(getPlatformMetadata("linkedin").capability.maxMediaCount).toBe(9);
    expect(getPlatformMetadata("instagram").capability.maxMediaCount).toBe(10);
    expect(getPlatformMetadata("x").capability.maxMediaCount).toBe(4);
  });

  it("carries the connect-UI labels (displayName, icon key, description) for every platform", () => {
    for (const id of PLATFORM_IDS) {
      const meta = getPlatformMetadata(id);
      expect(meta.displayName).toBeTruthy();
      expect(meta.icon).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
    expect(platformMetadata.map((m) => m.id)).toEqual([...PLATFORM_IDS]);
  });

  it("throws for an unregistered platform", () => {
    expect(() => getPlatformMetadata("pinterest")).toThrow();
  });
});

// TikTok is video-only (videoRequired) and carries the privacy/disclosure flag
// the composer keys off (privacyDisclosureApplies). Duration/aspect are carried
// for the UI but TikTok itself rejects out-of-spec video at publish time
// (surfaced via the status poll, ADR 0007), so they are not pre-validated here.
describe("TikTok Platform Capability validation", () => {
  const tiktok = getPlatformMetadata("tiktok").capability;

  it("requires a video and applies the privacy/disclosure setting", () => {
    expect(tiktok.videoRequired).toBe(true);
    expect(tiktok.mediaRequired).toBe(true);
    expect(tiktok.privacyDisclosureApplies).toBe(true);
    expect(tiktok.maxVideoDurationSec).toBeGreaterThan(0);
  });

  it("rejects a text-only post (a video is required)", () => {
    const errors = validateAgainstCapability(tiktok, { caption: "no video", media: [] });
    expect(errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["media_required", "video_required"])
    );
  });

  it("accepts a single video", () => {
    const errors = validateAgainstCapability(tiktok, {
      caption: "a clip",
      media: [{ isVideo: true }],
    });
    expect(errors).toEqual([]);
  });
});

// The Threads descriptor must drive composer/schedule-time validation: a 500-char
// cap, text-only allowed (no media required), and no video (reuses the async
// pipeline in Wave 2, ADR 0007) — so a video must be rejected before publish.
describe("Threads Platform Capability validation", () => {
  const threads = getPlatformMetadata("threads").capability;

  it("caps the caption at 500 characters", () => {
    expect(threads.maxCaptionLength).toBe(500);
    const errors = validateAgainstCapability(threads, {
      caption: "x".repeat(501),
      media: [],
    });
    expect(errors.map((e) => e.code)).toContain("caption_too_long");
  });

  it("accepts a text-only post (media is optional)", () => {
    const errors = validateAgainstCapability(threads, {
      caption: "just text",
      media: [],
    });
    expect(errors).toEqual([]);
  });

  it("rejects a video — Threads video is not yet supported", () => {
    const errors = validateAgainstCapability(threads, {
      caption: "a clip",
      media: [{ isVideo: true }],
    });
    expect(errors.map((e) => e.code)).toContain("video_not_supported");
  });
});
