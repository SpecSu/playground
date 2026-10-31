# Lunar Basketball Court Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an original low-poly half-court to the lunar sample, with a ball controlled only by a separately verified character's real hand/clip timeline.

**Architecture:** `LunarBasketballCourt` owns disposable visitor-only art and an explicit action-ID-scoped ball projection. `SampleScenery` mounts it only for lunar. The integration owner connects World visibility and the actual actor/rig; no character stand-in, autonomous timer, formal asset or command is added here.

**Tech Stack:** Existing Three.js, TypeScript, Node CPU geometry tests and actual World DOM fixture.

**Spec:** Parent task and integration-owner agreement dated 2026-10-26: existing v32 `71f7e8d5adc4dd8bc17337ac5cc97b6fdac89c0a`, original procedural court, real hand-driven shot, sample-only.

## Global Constraints
- Do not modify the frozen release tree, World movement, provider scopes, formal inventory or economy.
- Existing whole floor is world `[-10,10]²`; owned walkable footprint is `[-4,8]²`.
- Only paint ribbons enter owned land; hoop hardware clears owned land by more than 0.3 world units.
- Court x `[0.5,5.5]`, z `[-3.8,1.8]`; hoop rim `(3,2.15,-4.65)`, base centered `(3,0,-5.35)`.
- Six existing pending slots and three crater landmarks remain; supplied characters are not invented before actual assets arrive.
- `beginAction(id)` / `update({actionId,phase,clipTime,handWorld?,release?})` / `setPaused` / `cancel` / `dispose`: no RAF, wall clock or autonomous repetition.
- Release snapshot includes exact clip time, real hand ball-center, time to rim and apex rise; the first accepted release is copied and locked for that action.

## Review Focus
- No board/pole floats outside the floor or overlaps existing crater/bench/slot art.
- Painter geometry cannot block navigation or obscure deep water; no full-floor overlay.
- Unavailable/unverified characters cannot produce an unsolicited ball performance.
- Paused, canceled, stale action IDs and late post-dispose updates cannot advance or reattach the ball.
- Shot begins at the sampled hand point, crosses the real rim, then reaches the floor without penetrating it; it never teleports back to a hand automatically.

## Tasks
- [x] Add failing geometry, projection, continuity, disposal and action-lifecycle tests.
- [x] Implement `src/minimal/lunar-basketball-court.ts` with low-poly board/pole/rim/net, merged paint ribbons and initially hidden ball.
- [x] Add the minimal lunar-only `sample-scenery.ts` hook; expose the court for the integration owner, dispose exactly once before generic scenery cleanup.
- [x] Check actual scene projection and old four-theme geometry/navigation/disposal contracts; keep a separate strict court budget instead of weakening perimeter checks.
- [x] Run focused + full CPU/DOM tests, typecheck, lint and build. Freeze a clean commit and hand off actual actor integration to the main owner.

Character hand calibration, dribble contact events, rig generation, GLB admission and World integration are intentionally outside this module's ownership. The added `phase: dribble` / `ballWorld` frame only projects the rig owner’s sampled hand-contact/free-flight trajectory; it does not create a second bounce oscillator or claim the actual actor/track is integrated.


## Implemented verification

- 9 focused court tests pass. RED→GREEN includes absent court integration, upward paint winding, physical rim-to-base bracket connection, external dribble track projection and malformed late-release rejection.
- Final full ordinary suite: 963 total, 962 pass; sole expected failure is the existing source-sync manifest hash for modified `sample-scenery.ts`, left for the integration owner to refresh and extend with this new module.
- Final full React/actual World CPU DOM: 101/101 pass; typecheck, full lint, production build and `git diff --check` exit 0.
- Court budget: 16 meshes, 3 lines, 694 triangles. Hardware minimum owned-land clearance is 0.36500000357627904; all static art is supported inside the existing whole floor.
- Actual initial World camera projection maximum absolute x/y NDC is 0.8862655613279992, including all court/hoop mesh bounds. Existing lunar two-whole-crater framing test remains green.
- Existing real environment GLB regression remains green: 16 mesh roots, minimum owned-land clearance 0.3974122654510559. No original terrain/route/water state changed; six pending positions and three craters remain separate.
- Ball starts hidden, has no independent RAF/timer, stays frozen when paused, follows actor-supplied hand or dribble points, and uses a copied immutable exact release to pass through the rim before settling at floor+radius. Cancel/dispose reject stale action frames and release only visitor-owned art.

No actual character/rig is integrated by this branch, and no GPU/browser visual or mobile-performance acceptance is claimed. The integration/rig owners must bind verified character assets, real hand anchors, clip events, visibility and session cancellation before claiming a character plays basketball.
