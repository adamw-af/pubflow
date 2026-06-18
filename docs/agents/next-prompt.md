# Next-session prompt — Issue #4 (Trial funnel + branded auth)

Paste the block below to start the next session.

---

Implement issue #4 in adamw-af/pubflow: **"v2: Trial funnel (value-first) + branded auth pages"**. Read the full issue with `gh issue view 4`, and skim PRD #1 (`gh issue view 1`) for v2 context — especially User Stories 26–34 (Trial & billing funnel + branded auth). Read `CONTEXT.md` for the domain language you must match (**Workspace**, **Trial**, **Subscription**, **Social Account**, **tier**). There is no ADR for billing yet — if you make a structural decision here (how a Trial is represented, where the access gate lives), **write a short ADR** under `docs/adr/` the way the platform work did (0006/0007). **Branch from `main` after fetching** (`main` advances when #10/PR #24 merges).

**Why this next:** the v2 platforms are done (#8 TikTok, #10 YouTube). #4 is unblocked ("can start immediately") and is the **last remaining blocker on #11** (rebuilt onboarding + composer polish), so it's the critical-path pick. #12 (homepage) is also unblocked (#3 legal pages merged) but off the critical path.

**The core problem to fix:** today the funnel is **paywall-first**, the opposite of what the PRD wants. Concretely:
- `convex/workspaces.ts` → `createWorkspace` hardcodes `tier: "base"` and stores **no trial fields**.
- `convex/subscriptions.ts` → `checkUserSubscriptionStatus` is a **binary** `{ hasActiveSubscription: subscription?.status === "active" }` — no concept of a Trial.
- `app/routes/dashboard/layout.tsx` → hard-redirects anyone without an active subscription straight to `/subscription-required`. **A brand-new user can't reach the dashboard at all.** This gate is the thing to replace.
- `app/routes/sign-in.tsx` / `sign-up.tsx` → bare centered `<SignIn/>` / `<SignUp/>`, unbranded.

**This is a /tdd task.** The AC names the seam explicitly: *"Trial → active/expired transitions and the paywall trigger are covered by `convex-test`."* So the tracer bullets are **function-level convex-test** cases, written red-first, against a single access-decision query (see below). Use the existing harness pattern in `convex/posts.test.ts` (`convexTest`, `import schema`, `import.meta.glob`, `seedWorkspace`, `IDENTITY`, `withIdentity`). The Clerk-branding half is UI and isn't unit-tested — verify it by running the app.

**Design the access decision as one deep module (don't scatter `status === "active"` checks).** Mirror how `validateAgainstCapability` became the single source both the composer and the schedule gate call. Add one query — e.g. `subscriptions.getWorkspaceAccess` — that returns the workspace's access state and drives **every** consumer (the dashboard gate, the connect-another-account check, the Trial countdown, the paywall copy). Suggested shape:

```ts
{ state: "trial" | "active" | "expired";
  trialDaysRemaining?: number;     // when state === "trial"
  canConnectAnotherAccount: boolean; // free limit is ONE Social Account on Trial (US#30)
  reason?: "trial_expired" | "account_limit"; } // why the paywall, for the copy
```

Rules to encode (these become the convex-test cases, one per cycle):
- New Workspace with no Subscription and `now < trialEndsAt` → `trial` (with days remaining). *No credit card* (AC#1).
- `trial` Workspace can connect its **first** Social Account and schedule a Post (AC#2); connecting a **second** while still on Trial flips `canConnectAnotherAccount: false` with `reason: "account_limit"` (AC#3, US#30).
- No active Subscription and `now >= trialEndsAt` → `expired`, `reason: "trial_expired"` (AC#3).
- Active Subscription → `active`, lands straight in the dashboard (AC#5); the paid tier cap is `getTierAccountLimit(tier)` in `subscriptions.ts` (base 25 / pro 50 / premium ∞) — *distinct* from the 1-account Trial free limit, don't conflate them.

**What to build:**

- **Schema** (`convex/schema.ts`, `workspaces`): add a Trial field — `trialEndsAt: v.optional(v.number())` (simplest: derive state from it + Subscription, no separate status enum). Set it in `createWorkspace` (`Date.now() + 7 * 24 * 60 * 60 * 1000`). Keep `createWorkspace` idempotent as it is now.
- **`convex/subscriptions.ts`**: add `getWorkspaceAccess` (above). Decide whether `checkUserSubscriptionStatus` is replaced or kept as a thin wrapper — its only caller is `dashboard/layout.tsx`.
- **Connect-account enforcement**: the free limit must be enforced **server-side**, not just in the UI — block the second connect in the OAuth callback (`convex/oauth.ts`) and the credential-connect path (`convex/socialAccounts.ts`) when `!canConnectAnotherAccount`. Find where a `socialAccounts` row is inserted and gate it there so it can't be bypassed.
- **Dashboard gate** (`app/routes/dashboard/layout.tsx`): replace the binary redirect — `trial` and `active` get full access; only `expired` redirects to the paywall. Beware the existing `useQuery` runs **after** an early `return null` (conditional hook) — keep hook order legal when you refactor.
- **Trial countdown**: surface `trialDaysRemaining` in the dashboard chrome (`app/components/dashboard/site-header.tsx`) (AC#4).
- **Paywall** (`app/routes/subscription-required.tsx`): make the copy explain *why* (Trial expired vs. needs to subscribe to add another account), driven by `reason`. Pricing tiers/`pricing.tsx` are unchanged from v1.
- **Branded Clerk pages** (`sign-in.tsx`, `sign-up.tsx`): split-screen layout (brand panel + form), themed via Clerk's `appearance` prop wired to the app's design tokens. Both pages.

**Open questions to surface early (flag, don't block):**
- **Polar + a no-card Trial.** The Trial is *app-managed* (no card up front); Polar only enters at subscribe time via the existing `createCheckout` / `getAvailablePlansQuery` / webhook path in `subscriptions.ts`. Confirm we are **not** using Polar's native trial, and that nothing in the checkout/webhook flow assumes a card exists before subscribe. Note the env it needs (`POLAR_ACCESS_TOKEN`, `POLAR_SERVER`, `POLAR_ORGANIZATION_ID`).
- **Existing workspaces with no `trialEndsAt`** (rows created before this change): decide the back-compat default — treat missing `trialEndsAt` as `expired`, or backfill. Whatever you pick, encode it in `getWorkspaceAccess` so old rows don't crash the gate.
- **Onboarding stays minimal here.** Making the wizard fully Trial-aware + dynamic-platform is **#11's** job (it's blocked on this). Do only what #4's AC needs; don't pull #11's scope forward.

**Verification:** `npm run typecheck` clean; `npm test` green (new `subscriptions`/access convex-test cases + the existing 111 still pass). Run the app to eyeball the branded auth pages and the Trial countdown / paywall copy. When done, commit and open a PR; note that #4 unblocks #11, and call out the back-compat decision for pre-existing workspaces.
