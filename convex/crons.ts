import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "publish scheduled publications",
  { minutes: 1 },
  internal.publisher.processScheduledPublications
);

crons.daily(
  "refresh expiring oauth tokens",
  { hourUTC: 3, minuteUTC: 0 }, // 3am UTC daily
  internal.tokenRefresh.refreshExpiringTokens
);

export default crons;
