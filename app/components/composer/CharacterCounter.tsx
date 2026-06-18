import { PLATFORM_METADATA } from "../../../convex/platforms/metadata";

// Caption limits derive from the registry's per-platform capability, so the
// composer can never drift from what each adapter actually accepts (ADR 0006).
const PLATFORM_LIMITS: Record<string, number> = Object.fromEntries(
  Object.values(PLATFORM_METADATA).map((m) => [m.id, m.capability.maxCaptionLength])
);

interface CharacterCounterProps {
  platform: string;
  count: number;
}

export function CharacterCounter({ platform, count }: CharacterCounterProps) {
  const limit = PLATFORM_LIMITS[platform] ?? Infinity;
  const remaining = limit - count;
  const isOver = remaining < 0;
  const isWarning = remaining >= 0 && remaining < 20;

  return (
    <span
      className={
        isOver
          ? "text-destructive font-medium"
          : isWarning
            ? "text-amber-500"
            : "text-muted-foreground"
      }
    >
      {isOver ? `${Math.abs(remaining)} over limit` : `${remaining} remaining`}
    </span>
  );
}

export { PLATFORM_LIMITS };
