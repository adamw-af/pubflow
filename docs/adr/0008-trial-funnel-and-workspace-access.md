# Trial funnel: one access decision derived from Trial + Subscription

## Status

accepted

## Context

v1's funnel was paywall-first: `createWorkspace` hardcoded `tier: "base"` with no
Trial fields, `checkUserSubscriptionStatus` returned a binary
`{ hasActiveSubscription }`, and the dashboard layout hard-redirected anyone without
an active subscription to `/subscription-required`. A brand-new User could not reach
the dashboard at all — the opposite of the value-first funnel the PRD wants (a new
Workspace should begin on a 7-day Trial, no credit card, with enough access to reach
the "aha" moment).

Adding Trials introduces a three-way access state (`trial` / `active` / `expired`)
plus a free-limit rule (one connected Social Account on Trial, US#30, distinct from
the paid tier caps). Scattering `status === "active"` and ad-hoc day-math across the
dashboard gate, the connect-account paths, the Trial countdown, and the paywall copy
would drift out of sync the same way the pre-registry platform switches did (ADR 0006).

## Decision

Represent the Trial as a single optional field — `workspaces.trialEndsAt` — set to
`now + 7 days` at `createWorkspace`. Derive access state from that field plus the
Workspace's Subscription; no separate status enum.

Centralize the decision in one deep module, `computeWorkspaceAccess(ctx, workspaceId)`
in `convex/subscriptions.ts`, returning `{ state, trialDaysRemaining?,
canConnectAnotherAccount, reason? }`. It is the single source for every consumer:
the public `getWorkspaceAccess` query (dashboard gate, Trial countdown, paywall copy,
settings connect UI) and the server-side connect enforcement. Resolution order:
active Subscription → `active` (paid tier cap applies); else `now < trialEndsAt` →
`trial` (free limit of one Social Account); else `expired`.

The free-limit is enforced **server-side** at the single insertion seam,
`upsertSocialAccount` in `convex/oauth.ts` (shared by the OAuth callback and the
credential-connect path), so it cannot be bypassed by hitting either flow directly.
Re-connecting a known account (the patch branch) is never gated — only adding a new row.

Back-compat: a Workspace row created before Trials existed has no `trialEndsAt`. With
no active Subscription such a row resolves to `expired` (not a crash, not free access),
so the gate holds for old data without a migration. New Workspaces always get the field.

`checkUserSubscriptionStatus` is kept unchanged as a thin binary check — its other
callers (home, pricing, subscription-status) only need `hasActiveSubscription`.

## Considered alternatives

- **A `trialStatus` enum on the Workspace.** Rejected: redundant with `trialEndsAt`
  and the Subscription, and it would need a cron or write-on-read to flip `trial` →
  `expired`. Deriving the state at read time from a timestamp is simpler and always
  correct.
- **Polar's native trial.** Rejected for now: it requires a card up front, which
  contradicts the no-card Trial. Polar only enters at subscribe time via the existing
  `createCheckout` / webhook path (`POLAR_ACCESS_TOKEN`, `POLAR_SERVER`,
  `POLAR_ORGANIZATION_ID`); the Trial is app-managed.
- **Enforce the free limit only in the UI.** Rejected: the OAuth callback and
  credential paths write Social Accounts directly, so a UI-only check is bypassable.

## Consequences

- One query drives the whole funnel; changing a rule (Trial length, free limit) is a
  one-place edit covered by `convex-test` (`convex/subscriptions.test.ts`).
- `trialEndsAt` is optional forever to preserve back-compat; readers must treat a
  missing value as expired (encoded once, in `computeWorkspaceAccess`).
- A single OAuth grant that maps to multiple Social Accounts (e.g. Facebook Pages)
  can exceed the 1-account Trial limit; such flows require an active Subscription.
