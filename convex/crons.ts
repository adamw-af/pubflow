import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "publish scheduled publications",
  { minutes: 1 },
  internal.publisher.processScheduledPublications
);

// Async video publishing (ADR 0007): settle Publications left durably
// `publishing` by polling the platform for the stored job handle's status.
crons.interval(
  "poll publishing publications",
  { minutes: 1 },
  internal.publisher.pollPublishingPublications
);

crons.daily(
  "refresh expiring oauth tokens",
  { hourUTC: 3, minuteUTC: 0 }, // 3am UTC daily
  internal.tokenRefresh.refreshExpiringTokens
);

export default crons;
