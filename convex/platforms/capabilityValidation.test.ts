import { describe, expect, it } from "vitest";
import { validateAgainstCapability } from "./capabilityValidation";
import type { PlatformCapability } from "./types";

// A permissive baseline capability; individual tests tighten one field at a time
// so each assertion exercises exactly one rule.
const baseCapability: PlatformCapability = {
  maxCaptionLength: 1000,
  mediaRequired: false,
  videoRequired: false,
  multiImage: true,
  maxMediaCount: 10,
  titleRequired: false,
  privacyDisclosureApplies: false,
};

describe("validateAgainstCapability", () => {
  it("returns no errors when the variant satisfies the capability", () => {
    const errors = validateAgainstCapability(baseCapability, {
      caption: "hello world",
      media: [],
    });
    expect(errors).toEqual([]);
  });

  it("flags a caption longer than the Platform's max", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, maxCaptionLength: 10 },
      { caption: "this caption is way too long", media: [] }
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("caption_too_long");
    expect(errors[0].message).toMatch(/10/);
  });

  it("flags a variant with no media when media is required", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, mediaRequired: true },
      { caption: "needs a photo", media: [] }
    );
    expect(errors.map((e) => e.code)).toContain("media_required");
  });

  it("accepts a variant with media when media is required", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, mediaRequired: true },
      { caption: "has a photo", media: [{ isVideo: false }] }
    );
    expect(errors).toEqual([]);
  });

  it("flags more media items than the Platform allows", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, maxMediaCount: 2 },
      {
        caption: "too many",
        media: [{ isVideo: false }, { isVideo: false }, { isVideo: false }],
      }
    );
    expect(errors.map((e) => e.code)).toContain("too_many_media");
  });

  it("flags an image-only variant when a video is required", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, videoRequired: true },
      { caption: "should be a video", media: [{ isVideo: false }] }
    );
    expect(errors.map((e) => e.code)).toContain("video_required");
  });

  it("accepts a variant carrying a video when a video is required", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, videoRequired: true },
      { caption: "a short", media: [{ isVideo: true }] }
    );
    expect(errors).toEqual([]);
  });

  it("flags a video when the Platform does not support video (Bluesky)", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, videoSupported: false },
      { caption: "no video here please", media: [{ isVideo: true }] }
    );
    expect(errors.map((e) => e.code)).toContain("video_not_supported");
  });

  it("accepts images on a Platform that does not support video", () => {
    const errors = validateAgainstCapability(
      { ...baseCapability, videoSupported: false },
      { caption: "just a picture", media: [{ isVideo: false }] }
    );
    expect(errors).toEqual([]);
  });
});
