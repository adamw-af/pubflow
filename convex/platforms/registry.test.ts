import { describe, expect, it } from "vitest";
import {
  PLATFORM_IDS,
  adapters,
  getAdapter,
  platformMetadata,
} from "./registry";

describe("platform registry", () => {
  it("registers exactly the three v1 platforms", () => {
    expect([...PLATFORM_IDS].sort()).toEqual(["instagram", "linkedin", "x"]);
  });

  it("resolves an adapter by id", () => {
    expect(getAdapter("linkedin").displayName).toBe("LinkedIn");
    expect(getAdapter("x").id).toBe("x");
  });

  it("throws for an unknown platform id", () => {
    expect(() => getAdapter("tiktok")).toThrow();
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
