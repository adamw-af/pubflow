# Platform integrations use a self-contained adapter registry

## Status

accepted

## Context

In v1 a Platform was defined across four-plus scattered locations: the `platform`
union in `schema.ts`, the OAuth authorization-URL and token-exchange switches in
`oauth.ts`, the publish dispatch switch in `publishing/index.ts` (plus a per-platform
publish file), and token refresh in `tokenRefresh.ts`. Adding one platform meant
editing every switch and keeping them in sync. v2 adds five platforms (Facebook,
Threads, Bluesky, TikTok, YouTube Shorts) plus a new Platform Capability descriptor,
multiplying that surface area and the risk of inconsistency.

## Decision

Before adding any new platform, refactor v1's three platforms onto a **platform
adapter registry**. Each Platform is one self-contained module exporting a uniform
interface — `id`, `displayName`, `icon`, `capability` (the Platform Capability
descriptor), `oauth` (`authUrl` / `exchangeCode` / `refreshToken`), and
`publish(payload)`. A single registry maps `id → adapter`, and the schema union,
OAuth callback, publisher, capability lookup, and onboarding/composer UI all derive
from that one registry. Adding a platform becomes "add one file + register it" rather
than editing scattered switches.

## Considered alternatives

Keep extending the existing switch statements. Rejected: zero refactor cost now, but
it multiplies the per-platform cost across all five additions and compounds with
TikTok/YouTube's video-specific logic, which would make the switches significantly
gnarlier.

## Consequences

- One-time upfront refactor touches working v1 code (LinkedIn/Instagram/X), carrying
  regression risk; this is the opening task of v2 and must be verified against the
  three existing platforms before new platforms are added.
- Adds a layer of indirection (the adapter interface) in exchange for a single source
  of truth per platform.
