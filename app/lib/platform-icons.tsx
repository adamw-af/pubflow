import type { ReactNode } from "react";
import { Linkedin, Instagram, Facebook, AtSign, Music2 } from "lucide-react";

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
};

/** Render a platform's icon from its registry `icon` key. */
export function platformIcon(iconKey: string, className = "size-4"): ReactNode {
  return ICONS[iconKey]?.(className) ?? null;
}
