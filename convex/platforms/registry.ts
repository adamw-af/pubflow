import { v } from "convex/values";
import type { PlatformAdapter } from "./types";
import { PLATFORM_IDS, type PlatformId } from "./metadata";
import { linkedinAdapter } from "./linkedin";
import { instagramAdapter } from "./instagram";
import { xAdapter } from "./x";
import { blueskyAdapter } from "./bluesky";
import { facebookAdapter } from "./facebook";
import { threadsAdapter } from "./threads";

// ---------------------------------------------------------------------------
// The registry — single source of truth for every Platform (ADR 0006).
//
// Adding a Platform is: (1) write its adapter module, (2) add it to
// `PLATFORM_METADATA` (in metadata.ts) + `adapters` below. The schema union,
// OAuth callback, publisher, token refresh, and the connect/composer UI all
// derive from here — there are no per-platform switch statements left to edit.
//
// `PLATFORM_IDS`/`PlatformId` and the frontend-safe `platformMetadata` live in
// `./metadata` (which imports no server code) and are re-exported here so the
// backend has a single import site.
// ---------------------------------------------------------------------------

export {
  PLATFORM_IDS,
  platformMetadata,
  getPlatformMetadata,
  PLATFORM_METADATA,
} from "./metadata";
export type { PlatformId, PlatformMetadata } from "./metadata";

export const adapters: Record<PlatformId, PlatformAdapter> = {
  linkedin: linkedinAdapter,
  instagram: instagramAdapter,
  x: xAdapter,
  bluesky: blueskyAdapter,
  facebook: facebookAdapter,
  threads: threadsAdapter,
};

/** Resolve an adapter by id. Throws on an unknown platform. */
export function getAdapter(id: string): PlatformAdapter {
  const adapter = adapters[id as PlatformId];
  if (!adapter) throw new Error(`Unknown platform: ${id}`);
  return adapter;
}

// Convex schema/argument validator for the `platform` field, derived from the
// registry so the union can never drift from the set of registered adapters.
const platformLiterals = PLATFORM_IDS.map((id) => v.literal(id));
export const platformValidator = v.union(platformLiterals[0], ...platformLiterals.slice(1));
