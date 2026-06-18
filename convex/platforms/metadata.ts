// ---------------------------------------------------------------------------
// Platform metadata — the browser-safe projection of the registry (ADR 0006)
//
// This file holds only pure data and imports nothing but `types.ts`, so it is
// safe to import from both the Convex backend and the React frontend. It is the
// single source of truth for the platform list, labels and capability limits:
// the adapters spread their metadata from here, and the connect/composer UI
// derives its platform list + limits from here. Adding a platform is one entry
// in `PLATFORM_METADATA` (plus its adapter module) — no scattered UI edits.
// ---------------------------------------------------------------------------

import type { CredentialField, PlatformCapability } from "./types";

/** The canonical ordered list of supported platform ids. */
export const PLATFORM_IDS = ["linkedin", "instagram", "x", "bluesky", "facebook"] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

/** Pure, frontend-safe descriptor for a Platform — no publish/oauth behaviour. */
export type PlatformMetadata = {
  id: PlatformId;
  displayName: string;
  /** Icon key the frontend maps to a component (keeps this descriptor pure data). */
  icon: string;
  /** Short tagline shown beside the platform in the connect UI. */
  description: string;
  capability: PlatformCapability;
  /**
   * How the connect UI should authenticate this Platform: `"oauth"` redirects
   * to the Platform; `"credentials"` shows a form built from `credentialFields`.
   */
  authKind: "oauth" | "credentials";
  /** Fields the connect form prompts for (credentials platforms only). */
  credentialFields?: CredentialField[];
};

export const PLATFORM_METADATA: Record<PlatformId, PlatformMetadata> = {
  linkedin: {
    id: "linkedin",
    displayName: "LinkedIn",
    icon: "linkedin",
    description: "Share professional content",
    authKind: "oauth",
    capability: {
      maxCaptionLength: 3000,
      mediaRequired: false,
      videoRequired: false,
      multiImage: true,
      maxMediaCount: 9,
      titleRequired: false,
      privacyDisclosureApplies: false,
    },
  },
  instagram: {
    id: "instagram",
    displayName: "Instagram",
    icon: "instagram",
    description: "Photos, reels, and stories",
    authKind: "oauth",
    capability: {
      maxCaptionLength: 2200,
      mediaRequired: true,
      videoRequired: false,
      multiImage: true,
      maxMediaCount: 10,
      titleRequired: false,
      privacyDisclosureApplies: false,
    },
  },
  x: {
    id: "x",
    displayName: "X (Twitter)",
    icon: "x",
    description: "Short-form updates",
    authKind: "oauth",
    capability: {
      maxCaptionLength: 280,
      mediaRequired: false,
      videoRequired: false,
      multiImage: true,
      maxMediaCount: 4,
      titleRequired: false,
      privacyDisclosureApplies: false,
    },
  },
  bluesky: {
    id: "bluesky",
    displayName: "Bluesky",
    icon: "bluesky",
    description: "Open social on AT Protocol",
    authKind: "credentials",
    credentialFields: [
      { name: "identifier", label: "Handle", type: "text", placeholder: "you.bsky.social" },
      {
        name: "appPassword",
        label: "App password",
        type: "password",
        placeholder: "xxxx-xxxx-xxxx-xxxx",
      },
    ],
    capability: {
      maxCaptionLength: 300,
      mediaRequired: false,
      videoRequired: false,
      videoSupported: false,
      multiImage: true,
      maxMediaCount: 4,
      titleRequired: false,
      privacyDisclosureApplies: false,
    },
  },
  facebook: {
    id: "facebook",
    displayName: "Facebook",
    icon: "facebook",
    description: "Post to your Facebook Pages",
    authKind: "oauth",
    capability: {
      // Facebook's post body limit is generous; images are optional (text/link
      // posts are fine). No video for now (videoSupported: false).
      maxCaptionLength: 63206,
      mediaRequired: false,
      videoRequired: false,
      videoSupported: false,
      multiImage: true,
      maxMediaCount: 10,
      titleRequired: false,
      privacyDisclosureApplies: false,
    },
  },
};

/** Ordered metadata list — the connect/composer UI iterates this. */
export const platformMetadata: PlatformMetadata[] = PLATFORM_IDS.map(
  (id) => PLATFORM_METADATA[id]
);

/** Resolve a Platform's metadata by id. Throws on an unknown platform. */
export function getPlatformMetadata(id: string): PlatformMetadata {
  const meta = PLATFORM_METADATA[id as PlatformId];
  if (!meta) throw new Error(`Unknown platform: ${id}`);
  return meta;
}
