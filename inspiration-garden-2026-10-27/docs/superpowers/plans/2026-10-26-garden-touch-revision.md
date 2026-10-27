# Garden Touch Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make direct plant play effortless, creation a single clear action, and large demo residents genuinely spatial.

**Architecture:** Extend pure state rules and optional saved plantBag without replacing the safe coordinator. A shared footprint module supplies occupancy to state, validation and scene. Existing Canvas and authored manifests remain replaceable.

**Tech Stack:** Dependency-free ES modules, Canvas2D, WebAudio, node:test.

**Spec:** `docs/superpowers/specs/2026-10-26-garden-touch-revision.md`

## Global Constraints
- Same namespace/version; checksummed old bytes validate before defaults; all provenance/economy preserved.
- Original12 avatars and old manor untouched; no live AI/server/payments claim.
- Runtime/state/tests only; artist owns assets/compositions; parent publishes.
- One daily seed quota per visitor/variety/Beijing day across all copies.

## Review Focus
- Old checksummed save missing optional bag → lossless load, expected-head remains original bytes (Task1).
- Same instance packed/restored/sold repeatedly → no duplicates or rewards (Task1).
- Giant nonanchor occupied cell build/reclaim/overlap → atomic rejection (Task3).
- Original entry after remix and unsupported repeated submit → no stale parent or crystal spend (Task2).
- Interrupted route and repeated direct controls → stable target, no blocking action queue (Task4).

### Task1: Whole plants and shared shaking quota
**Files:** src/state.js, src/storage.js, src/footprints.js; tests/plant-bag.test.js, tests/storage.test.js.
**Interfaces:** `plantBag?:Plant[]`, PACK_PLANT{plantId}, RESTORE_PLANT{plantId,tileId}, SHAKE_SEED{plantId,gardenId?}; `occupiedTileIds(world,plant,variety)` and `canPlacePlant(world,variety,tileId,exceptId?)`.
- [x] Write tests packing same instance, time continuation, duplicate/sell protection, shared-day quota, legacy checksummed load and malformed optional bag; run RED.
- [x] Implement pure transactions/defaults and shared footprint helpers; run targeted then full GREEN.
- [x] Commit tested state slice.

### Task2: Compact contextual actions and creation
**Files:** src/ui.js, src/ui-state.js, src/app.js, styles.css; tests/ui.test.js, tests/app-lifecycle.test.js.
**Interfaces:** create route stores `{path,parentId,idea,error,reuseId}`; form submit matches allowed sample then executes CREATE_VARIETY once. Original entry always clears parent. Bag adds whole-plants tab and placement mode `restore`.
- [x] Write UI/controller tests no replay/tabs/dropdown/grid; fixed remix parent, original reset, unsupported no charge, duplicate reuse, bag restore mode; run RED.
- [x] Implement compact context and sticky single-action creation, packing/shaking/restoring dispatch; run targeted and full GREEN.
- [x] Commit tested interaction slice.

### Task3: Genuine giants and demo exhibits
**Files:** src/catalogue.js, src/footprints.js, src/state.js, src/storage.js, src/scene.js, src/ui.js; tests/footprints.test.js, tests/gardens.test.js.
**Interfaces:** trusted giant art→2×2 mapping, authored plant `footprint:[2,2]`; exhibits `{id,artKey,x,y,footprint,interaction,label}` normalized from artist source.
- [x] Write occupancy, restore, move/reclaim, save corruption and all3layout tests; run RED.
- [x] Integrate final artist keys/layouts, center-root rendering, placement ghosts and exhibit hits with existing local sound; run GREEN.
- [x] Commit tested content integration.

### Task4: Natural walking and final QA
**Files:** src/visual-walk.js, src/scene.js; tests/visual-walk.test.js; README.md.
**Interfaces:** default stepMs380, continuous route-time start/end easing; route replacement BFS unchanged.
- [x] Write timing/start-stop/continuous-boundary/replacement tests; run RED.
- [x] Implement and run full tests, syntax and build; document focused evidence, request parent independent review/native QA.
- [x] Commit coherent candidate; no publish.
