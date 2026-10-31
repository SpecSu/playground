# Lunar showcase controls implementation plan

> Implement inline with TDD; the main integrator owns World, Scene, registry and assets.

**Goal:** Expose admitted lunar characters as a compact, honest, keyboard-accessible portrait strip with temporary actions.
**Approach:** Use the existing VisitorFarm and World API, plus a pure controls component. Native buttons with aria-pressed keep focus predictable. No new animal/economy state, no automatic approach, no replacement portraits, no sixth placeholder. Exact resource scope is required before a library is created.

## Tasks
- [x] RED: controls show actual portraits/status, selection and action dispatch, failed retry and no-carry reason; selected carry remains reachable.
- [x] GREEN: new LunarShowcaseControls, small friends.css styles.
- [x] RED: actual VisitorFarm/World loads a scoped synthetic test fixture, dispatches showcase targets without animal alias, pauses during help/boarding/blur/hidden, rebuilds on viewerKey changes and ignores stale callbacks.
- [x] GREEN: bind a per-visit library only for lunar; state snapshots through showcaseChanged; guard mixed carry; cancel walk before actions; resume only if visible/focused/no modal.
- [x] Verify ordinary tests, all React/World CPU DOM, typecheck, full lint and build. Main refreshes aggregate source pins. Freeze a clean SHA for independent review; no publish.

## Review focus
Model load failure must not look ready. Modal close must not override hidden/blur pause. A changed viewer must not inherit carried state or stale status. Showcase actions must never enter VisitorSession commands or home outbox. Portrait buttons and compact action rows must keep at least existing physical touch targets and horizontal scrolling.

## Freeze evidence
- Controls missing module and actual Visitor missing library hookup both failed first; focus replacement and lunar ordinary-boarding prohibition each had a separate RED assertion before fixes.
- Final UI/actual World CPU DOM: **106/106 passed**, including scoped synthetic skin load, failed retry, viewer replacement, stale status/bytes, modal/blur/hidden pause, lost-focus repair and unchanged formal storage. The old six-placeholder UI expectation was replaced by the current no-sixth/unscoped-unavailable contract.
- Final ordinary suite: **983/984 passed**. Only `the exact pinned source sync stays intact without overwriting Sites-specific entry or legacy clients` fails against the pre-existing aggregate source pin; the main integrator owns its refresh. Baseline at 992ff49 had the same sole failure.
- Final `typecheck`, full `lint`, production `build`, and `git diff --check`: exit 0.
- Logs: `/tmp/lunar-showcase-ui-freeze-{full,dom,type,lint,build}.log`.
- Lunar ordinary breeding is intentionally absent: those five DIY identities have no supported ordinary breeding contract. The other three demo farms retain the existing isolated sample adapter.
- This UI branch does not admit production assets and does not claim GPU/native-browser visual or hardware performance validation. Real asset Scene/court verification is independent and ongoing on the integrator's exact snapshot, not part of this UI proof. Final UI review must be by another reviewer.
