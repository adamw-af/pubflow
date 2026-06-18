import type { ReactNode } from "react";
import { Linkedin, Instagram, Facebook, AtSign, Music2, Youtube } from "lucide-react";

// The registry (convex/platforms/metadata.ts) is pure data and exposes each
// platform's `icon` as a string key. Icons are React components, so this map is
// the one irreducibly-frontend piece of platform config — the single place a
// new platform needs a UI edit beyond its adapter + metadata entry.
const ICONS: Record<string, (className: string) => ReactNode> = {
  linkedin: (className) => <Linkedin className={className} />,
  instagram: (className) => <Instagram className={className} />,
  x: () => <span className="font-bold leading-none">𝕏</span>,
  bluesky: () => <span className="leading-none">🦋</span>,
  facebook: (className) => <Facebook className={className} />,
  threads: (className) => <AtSign className={className} />,
  tiktok: (className) => <Music2 className={className} />,
  youtube: (className) => <Youtube className={className} />,
};

/** Render a platform's icon from its registry `icon` key. */
export function platformIcon(iconKey: string, className = "size-4"): ReactNode {
  return ICONS[iconKey]?.(className) ?? null;
}

// Platform ids that have a `--ch-<id>` brand-colour token in `app/app.css`.
// Kept here next to the icons so the two frontend-only bits of platform config
// live together — a new platform adds one entry here, one token in the CSS.
const BRAND_COLOR_IDS = new Set([
  "linkedin",
  "instagram",
  "x",
  "bluesky",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
]);

/**
 * The brand colour for a Platform, as a CSS value referencing the `--ch-<id>`
 * token. Falls back to a neutral so an unknown/just-merged platform renders a
 * muted chip rather than a blank/black one. Use in an inline `style` (the
 * tokens are runtime CSS variables, not Tailwind classes).
 */
export function platformBrandColor(platformId: string): string {
  return BRAND_COLOR_IDS.has(platformId)
    ? `var(--ch-${platformId})`
    : "var(--text-muted)";
}
