# Next-session prompt — v2 agent-codeable scope is complete; operator handoff for app-review ops

Paste the block below to start the next session.

---

**There is no build task to pick up. Verify that first, then hand off to the operator.** With YouTube Shorts re-landed (issue #10, PR #29), **every agent-codeable v2 sub-issue is done** — confirm this yourself before doing anything else, don't take it on faith. Run `gh issue list --state open` in adamw-af/pubflow: the only open issues should be **#1** (the PRD umbrella — a tracker, not a task; all its build children #2–#12 are closed) and the three **`ready-for-human`** ops issues **#13, #14, #15**. Every v2 build slice — registry refactor (#2), legal pages (#3), Trial funnel (#4), Capability + composer validation (#5), Facebook (#6), Bluesky (#7), TikTok + async pipeline (#8), Threads (#9), **YouTube Shorts (#10)**, homepage (#12), onboarding/composer polish (#11) — is merged. **Do not invent a new build task or re-scope the PRD to manufacture agent work.**

**The one loose end an agent *can* close:**
- **Merge PR #29** (the YouTube Shorts recovery — re-lands #10's work that a history rewrite dropped from `main`). It `Closes #10`, so #10 stays *reopened* until #29 lands. Confirm CI is green, merge it, and verify #10 closes. If #29 is already merged and #10 closed when this session starts, there is nothing left to do here — say so and stop.
- Once #29 is merged, the only thing keeping **#1 (the PRD)** open is the three ops submissions below; #1 can be closed when #13/#14/#15 are all done.

**What remains is human-owned ops — surface it, don't attempt it.** #13/#14/#15 are app-review submissions that require a person: developer-portal account setup, OAuth consent-screen / app configuration, submitting for review, and recording a demo screencast of the real flow. An agent cannot do these. The adapters they depend on are now all demo-able in `main` (the gating build work is done), so each is unblocked and ready for the operator to start:
- **#13 — Meta app review (Facebook Pages + Threads).** First confirm whether the existing v1 Meta app is in production mode (decides permission-add vs. fresh review). Submit `pages_manage_posts` + Threads publishing with a demo screencast.
- **#14 — TikTok Content Posting API audit.** Submit with the required demo; the TikTok adapter runs in unaudited (`SELF_ONLY`) mode until audited.
- **#15 — Google/YouTube OAuth verification.** Submit for the `youtube.upload` scope with a demo. **Until verified, an unverified Google app forces every upload to `private` regardless of requested `privacyStatus`** — so live public YouTube posting is blocked on this, even though the adapter is complete. Be prepared for a possible security assessment depending on user-base size.

**So the actual next action for a *human* operator:** pick up #13, #14, and #15 (they can run in parallel — different portals, independent lead times). **For an *agent* session:** confirm #29 is merged and #10 closed, report the ops handoff above, and stop — there is no code to write. If the operator wants agent help *around* the submissions (e.g. drafting a demo script, a reviewer-facing data-handling write-up, or a screencast shot-list), that's a fresh, explicitly-scoped request — ask before building anything.
