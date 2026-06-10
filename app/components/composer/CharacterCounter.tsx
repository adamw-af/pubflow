const PLATFORM_LIMITS: Record<string, number> = {
  linkedin: 3000,
  instagram: 2200,
  x: 280,
};

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
