# Async video publishing is a durable `publishing` state polled by cron

## Status

accepted

## Context

v1's publisher claims due Publications and calls `publish()` synchronously: one API
call returns a post ID and the Publication is marked `published`. TikTok and YouTube
Shorts cannot complete this way — posting a video is asynchronous: initiate an upload
session, upload bytes (large, chunked/resumable), the platform transcodes on its side
(seconds to minutes), then the caller polls for status. A single synchronous
`publish()` call cannot finish a video Publication.

## Decision

Stay within the existing cron-polling architecture (see ADR 0001). An adapter's
`publish()` may return either *done* (sync platforms) or *in-progress with a platform
job/upload handle* (async platforms). For the async case the Publication remains in a
durable `publishing` state with the handle stored, and a cron sweep polls the adapter
for completion, transitioning to `published` or `failed`. The large-video upload
reuses the existing R2 presigned-upload path (browser → R2); the platform upload runs
server-side from R2.

## Considered alternatives

Introduce a dedicated job/workflow orchestrator. Rejected: more powerful but heavier
than the "Convex cron polling" bet in ADR 0001, and it would mean maintaining two
publishing models.

## Consequences

- `publishing` becomes a real, durable waiting state — not a momentary one — and
  needs a stored platform handle plus a polling sweep.
- `PublishResult` grows a third shape (in-progress) alongside success/failure.
