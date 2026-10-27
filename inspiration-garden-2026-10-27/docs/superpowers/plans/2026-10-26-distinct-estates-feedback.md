# Distinct Estates Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox syntax.

**Goal:** Apply the completed feedback without losing local progress or weakening interaction safety.
**Architecture:** Add a pure plant-stand route selector to the shared transient walker; keep global terrain/save semantics unchanged. Reuse existing audio, palette, loader, camera and reducer boundaries, and integrate approved art only after independent gates.
**Tech Stack:** Existing dependency-free ES modules, Canvas2D, WebAudio, Node tests.
**Spec:** docs/superpowers/specs/2026-10-26-distinct-estates-feedback-design.md

## Global Constraints
- Parent-only publication and native QA; no private reference/work assets in package.
- Keep old IDs/authors/timestamps/checksum/head and all20/50/60 building rules.
- No crystal migration, new background recording, per-cell editor, global plant hard collision or source teleport.
- Exact cloud text 正在穿梭...; entry zoom is precisely existing plus factor squared with clamp.

## Review Focus
- Legacy actor begins inside the target: exit continuously without crossing other target cells or teleport.
- Released/held approach canceled by another command/scene/structure must never replay a delayed performance.
- Async image failure, selected outfit failure or hidden transition cannot rebuild focused editors or alter saved data.
- Touch compatibility mouse events must not turn one double gesture into200coins, nor a single into100.
- Optional new art/catalogue IDs must not corrupt old received/owned collisions; public package only approved references.

## Task1: Plant outside stance
Files: new src/plant-approach.js and tests/plant-approach.test.js; modify visual-walk.js/garden-life.js/scene/app feedback plus existing integration fixtures.
- [ ] RED nearest reachable empty outside1×1/2×2, blocked/corner/legacy-inside and no-room cases.
- [ ] Implement pure route selection and shared explicit interaction option, preserve raw travel.
- [ ] Prove continuous segments, arrival/facing and manual/idle/held cancellation; full tests/check/build; pin.

## Task2: Quiet audio and small visual corrections
Files: interactions.js/app.js, remove background module integration/tests; scene.js/terrain-palettes.js/index.html and dedicated tests.
- [ ] RED no background nodes/timer on unlock/world switch, while FX/mute/deferred sale remain.
- [ ] Remove melodic BGM; RED/implement exact cloud copy and palette-derived grid/outer edges.
- [ ] Full tests/check/build and pin sound/visual scope.

## Task3: Entry close framing and wallet demo intent
Files: scene framing/camera helpers and app/state/ui gesture wiring, isolated wallet helper if parent delegates; dedicated tests.
- [ ] RED initial/visit/home/repeated-switch plus-factor-squared/clamp/manual behavior.
- [ ] RED mouse/touch single/double/compat events/cancel/unready/cap/save cases.
- [ ] Add atomic fixed100 demo action, existing coin feedback and stable wallet DOM; pin after full checks.

## Task4: Resource and yellow pen integration
Files: assets.js and tests; approved image/manifest/source refs only.
- [ ] RED fail-once success/max-failure/dedup/revisit retry and no editor/save writes.
- [ ] Implement bounded retry, destination-only warming; encode selected large art without creative edits.
- [ ] Promote approved yellow pen/source, lock identity/shape/economy invariants; full verification and pin.

## Task5: Final estates and matching photos
Files: approved art manifests/assets, catalogue/blueprints/scene-life lines, map source/generated data by coordinated owner; photo manifest references.
- [ ] Agree immutable IDs, precise shapes/anchors/widths and safe visitor/host/player/spider bays.
- [ ] Verify source credits/collision preservation, broad routes/visible entry and honest controls.
- [ ] Promote only approved final maps and then matching three photo backgrounds; no scene screenshot substitute.
- [ ] Immutable full test/check/build/diff/privacy review, parent native QA and authorized release.
