# Pause Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax.

**Goal:** Reversibly pause defense in the active Minimal farm and call custom creatures 小伙伴.
**Architecture:** Shared internal pause policy gates model, canonical catch-up, World, UI and audio. Keep storage contracts and receipt-first authority execution unchanged.
**Tech Stack:** TypeScript, React, Three.js, Node test runner, CPU happy-dom fixtures.
**Spec:** docs/superpowers/specs/2026-10-27-pause-defense-design.md

## Global Constraints
- Base is published P0 v36 7de310505c5ef4dae428ba4964f8494b0cdeef50.
- Independent worktree; no deployment, browser, real database, schema/ID/auth or school file edits.
- Preserve defense fields and immutable existing receipts; do not invent mechanisms absent from Minimal.
- Ordinary animals/ecology eggs, economy/growth/trades and local Node protocol remain unchanged.

## Review Focus
- Active saved wolf event beyond expiry/offline catch-up must retain original event data but stay inert.
- Old guardian selection with no receipt must terminally reject and permit the next command.
- Lost ACK for an executed old request must replay its exact receipt and never change currency again.
- Dormant guardian must not load or leave invisible avoidance/picking geometry.
- Custom wording must change accessible category names and help without renaming API kinds or ordinary eggs.

### Task 1: Model and compatibility
**Files:** new src/minimal/defense-policy.ts; model.ts; canonical-timeline.ts; tests/minimal-defense-pause.test.ts; tests/minimal-defense-outbox.test.ts.
**Interfaces:** internal MINIMAL_DEFENSE_ENABLED boolean and inactive-command predicate/message; no public schema change.
- [x] Write failing cases for quiet overdue saves, active/expired events, new playable farm, rejected guardian/wolf/help, canonical catch-up and preserved data.
- [x] Run `node --experimental-strip-types --test tests/minimal-defense-pause.test.ts`; verify expected behavior failures.
- [x] Gate event advancement and obsolete commands; leave parsers and receipt-first authority intact.
- [x] Write/run actual old-source receipt and outbox replay tests, including before/after-commit response loss and malformed input.
- [x] Run focused tests and commit only after they pass.

### Task 2: Scene, UI, audio and copy
**Files:** World.ts; MinimalApp.tsx; audio.ts; CreativeStudio.tsx; creative-authority.ts; existing audio/custom tests; new tests/minimal-defense-pause.dom.mjs.
**Interfaces:** all consumers use same internal policy; no save clearing for display.
- [x] First assert no guardian/wolf allocation, scene/avoidance footprint, warning or audio; normal discovery/care visible for a saved active event. Assert custom 小伙伴 category/help and ordinary animal egg copy.
- [x] Run focused DOM/audio tests and observe expected failures.
- [x] Gate allocation, update, avoidance, UI and audio; change only custom character copy.
- [x] Run all affected CPU DOM tests, full npm test, typecheck and lint. Record baseline/pin failures rather than editing frozen package manifests.
- [x] Commit and hand exact hash to integrator for independent review; no merge or deployment.


## Verification record (2026-10-27)

Product source is frozen at `026be78719f4a724fbeb957556d4cc435ac20137` after implementation `f8f4bb74fe597305ad80716bbc9c990c0d02734d` and initial bounded design `94a6a8c`.

| Check | Outcome |
| --- | --- |
| Unmodified v36 full `npm test` | 1050 pass, 0 fail, 2 skip |
| Model/audio/historical receipt and pending tests | 30/30 pass |
| Existing affected custom/wish/boarding/shop CPU DOM plus custom copy | 30/30 pass |
| Actual World/App and settings-help CPU DOM | 3/3 pass |
| Final `npm run typecheck` and `npm run lint` | Pass |
| Final `npm run build` | Pass, exit 0 |
| Final full `npm test` after review fix | 1074 pass, 1 integration source-pin mismatch, 2 skip |
| Independent review | Core/World/App 32/32, copy/egg/boarding 12/12; all 70 historical source modules exactly match v36 |

The single full-suite failure is `tests/sites-v27-integration.test.ts:108`, `the exact pinned source sync stays intact without overwriting Sites-specific entry or legacy clients`: `docs/sites-named-demo-source-sync.json` intentionally still pins published v36 source bytes. The first mismatch is the changed custom label in `src/minimal/BoardingAnimalCards.tsx`. The school integrator owns that frozen manifest and will refresh it against the combined final source after merging this increment, then rerun this check. This is an expected integration task, not a product behavior failure; the entire suite is **not** reported green.

### Review fix
The reviewer found the settings help still described wolf tension music. A new actual settings/help DOM case first failed on that visible text, then passed after the text was gated by the same pause policy (`026be78`). No other independent findings remain. No second review pass or unrelated refactor was performed.

### Handoff and exclusions
- Keep `feat/pause-defense` and `/workspace/scratch/c53ce48861c9/farm-retire-defense` for the integrator; do not merge/deploy from this branch.
- Refresh source pins only after school publication and integration; retain old compatibility chunks, model assets and Node protocol.
- Apply the separately handed-off `VisitorFarm.tsx` custom pending hint from “未用其他动物代替” to “未用其他小伙伴代替”; it was not edited in this branch because it belongs to the frozen school owner.
- The exact v36 fixture is public source code, not user save data. Tests use temporary/in-memory SQLite only.
- No CUA, Playwright, browser, real user database or deployment was used. CPU DOM tests do not claim visual/browser/speaker acceptance.
