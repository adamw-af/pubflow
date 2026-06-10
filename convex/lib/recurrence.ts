/**
 * Computes the next UTC timestamp for a RecurrenceRule after a given point in time.
 * All scheduling uses the Workspace timezone for wall-clock interpretation.
 */

export type RecurrenceRule = {
  frequency: "daily" | "weekly" | "monthly";
  daysOfWeek?: number[]; // 0=Sun … 6=Sat, used when frequency="weekly"
  dayOfMonth?: number;   // 1–28, used when frequency="monthly"
  timeOfDay: string;     // "HH:MM"
  endsAt?: number;       // UTC ms, optional end date
};

const MS_PER_DAY = 86_400_000;

/**
 * Returns the next UTC timestamp matching the rule, strictly after `after`.
 * Searches up to 366 days ahead.
 */
export function getNextOccurrence(
  rule: RecurrenceRule,
  timezone: string,
  after: number = Date.now()
): number | null {
  if (rule.endsAt && after >= rule.endsAt) return null;

  for (let i = 0; i < 366; i++) {
    const candidateMs = after + i * MS_PER_DAY;
    const parts = getDateParts(candidateMs, timezone);

    let matches = false;
    switch (rule.frequency) {
      case "daily":
        matches = true;
        break;
      case "weekly":
        matches = (rule.daysOfWeek ?? []).includes(parts.dayOfWeek);
        break;
      case "monthly":
        matches = parts.day === (rule.dayOfMonth ?? 1);
        break;
    }

    if (!matches) continue;

    const [hh, mm] = rule.timeOfDay.split(":").map(Number);
    const utcTs = localToUTC(parts.year, parts.month, parts.day, hh, mm, timezone);

    if (utcTs <= after) continue;
    if (rule.endsAt && utcTs > rule.endsAt) return null;

    return utcTs;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type DateParts = {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  dayOfWeek: number; // 0=Sun … 6=Sat
};

function getDateParts(utcMs: number, timezone: string): DateParts {
  const date = new Date(utcMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
    dayOfWeek: weekdays.indexOf(get("weekday")),
  };
}

/**
 * Converts a wall-clock datetime in `timezone` to a UTC timestamp.
 * Uses an offset-correction approach via Intl — handles DST correctly
 * for the vast majority of transitions.
 */
function localToUTC(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
): number {
  // Approximate UTC (as if local time were UTC)
  const approx = Date.UTC(year, month - 1, day, hours, minutes);

  // Find what the approximate UTC timestamp looks like in the target timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(approx));

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0");

  const localHour = get("hour") % 24; // guard against "24" midnight edge case
  const localAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), localHour, get("minute"));
  const offset = approx - localAsUTC;

  return approx + offset;
}
