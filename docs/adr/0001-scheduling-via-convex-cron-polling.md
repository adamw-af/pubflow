# Scheduling via Convex cron polling

Publications are dispatched by a Convex cron that runs every minute and queries for Publications with status `scheduled` and a `scheduledAt` time in the past. We chose this over per-Post scheduled functions (`ctx.scheduler.runAt`) because the queue is fully visible in the database (easier to debug, retry, and backfill), and over external orchestration tools (Inngest, Trigger.dev) to avoid an additional paid service. Minute-level resolution is sufficient for a social media scheduler.
