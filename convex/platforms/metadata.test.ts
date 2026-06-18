import { describe, expect, it } from "vitest";
import { PLATFORM_IDS, getPlatformMetadata, platformMetadata } from "./metadata";

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
    expect(() => getPlatformMetadata("tiktok")).toThrow();
  });
});
