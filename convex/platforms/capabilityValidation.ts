// ---------------------------------------------------------------------------
// Platform Capability validation (ADR 0006)
//
// The single, canonical check of whether a Post Variant satisfies its target
// Platform's Capability. Pure and frontend-safe — it imports only `types.ts`
// and touches no Convex-server or React APIs — so the composer (inline,
// per-Platform errors) and the backend (schedule-time gating) validate against
// exactly the same rules and can never drift.
// ---------------------------------------------------------------------------

import type { PlatformCapability } from "./types";

/** The minimum a variant needs to expose about one attached media item. */
export type MediaInput = {
  isVideo: boolean;
};

/** The slice of a Post Variant that capability validation looks at. */
export type VariantInput = {
  caption: string;
  media: MediaInput[];
};

/** A single, machine-readable reason a variant violates its target Capability. */
export type CapabilityError = {
  /** Stable code the UI can switch on; never localise off the message. */
  code: string;
  /** Human-facing explanation, safe to show inline against the Platform. */
  message: string;
};

export function validateAgainstCapability(
  capability: PlatformCapability,
  variant: VariantInput
): CapabilityError[] {
  const errors: CapabilityError[] = [];

  if (variant.caption.length > capability.maxCaptionLength) {
    errors.push({
      code: "caption_too_long",
      message: `Caption is ${variant.caption.length} characters; this platform allows at most ${capability.maxCaptionLength}.`,
    });
  }

  if (capability.mediaRequired && variant.media.length === 0) {
    errors.push({
      code: "media_required",
      message: "This platform requires at least one image or video.",
    });
  }

  if (capability.videoRequired && !variant.media.some((m) => m.isVideo)) {
    errors.push({
      code: "video_required",
      message: "This platform requires a video.",
    });
  }

  if (variant.media.length > capability.maxMediaCount) {
    errors.push({
      code: "too_many_media",
      message: `This platform allows at most ${capability.maxMediaCount} media item${capability.maxMediaCount === 1 ? "" : "s"}.`,
    });
  }

  return errors;
}
