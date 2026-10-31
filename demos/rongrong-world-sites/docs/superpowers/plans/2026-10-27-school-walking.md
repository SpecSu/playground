# School Walking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Correct v37 school to real player navigation and player-follow camera.
**Architecture:** Dedicated local school controller reuses original LX/motion/pose helpers; actual mesh-footprint navigation and dynamic runner circles, never canonical tiles.
**Tech Stack:** Existing TypeScript/Three/React and Node CPU DOM, no dependencies.
**Spec:** docs/superpowers/specs/2026-10-27-school-walking-design.md

## Global Constraints
Base9e29b322, independent worktree. No shared World/MinimalApp/model edits, no account writes/publish/browser. Same .65 LX scale and existing motion speed. Eight true run clips unchanged.

## Review Focus
Ground clicks after selecting runner must close menu and move; a drag returning to origin must not become tap. Building footprint only, no large roof/group box. Dynamic crossing must progress without overlap or permanent player blockage. Hidden/modal/late avatar loading cannot resume stale movement. Return retains home camera/data.

### Task1: Real path/controller and static footprints
Files new playground-navigation.ts; modified scenery helper; new unit tests.
- [ ] RED spawn four-direction reachability, real foot-space/no overhead blocker, exact segment safety, original speed/retarget and dynamic-circle detour.
- [ ] Implement bounded .5m lattice A* with direct shortcut, existing grid-motion adapter, snapshot/predict/cancel.
- [ ] GREEN and commit.

### Task2: Actual player, camera, ground pointer and yield
Files SchoolPlaygroundWorld.ts, narrow formation/scene preview methods; actualWorld DOM tests.
- [ ] RED actual canvas ground click moves real LX, speed/frame bounds, camera follows player not team; drag/UI nonclick; occupied feedback; dynamic run yield then resume.
- [ ] Reuse LX/pose/motion/tap helpers, exact footprints, continuous player camera, lifecycle-safe ready/dispose and route marker.
- [ ] GREEN actualGLB/player CPU geometry and commit.

### Task3: Normal compact interaction and final integration
Files SchoolPlayground.tsx/playground.css/tests; no oldWorld/App changes.
- [ ] Remove observer/free/team-follow toggle and copy; ground command closes selected info; compact nearby greeting only, no transfer.
- [ ] Preserve BGM/modal/blur/viewer/late/home behavior with actual React tests.
- [ ] Fresh focused/full/type/lint/build and sole independent combined review through main; exact SHA handoff.

## Execution ledger
- RED: missing navigation helper; GREEN4 tests actual footprints/four-way routes/current-circle detours/original speed and surfaces.
- ActualWorld RED: playerMotionSnapshot absent and no real player; GREEN real LX/canvas walking/speed/camera/invalid buildings.
- Dynamic RED from own south-lane and independent north-lane: uncommitted swept runner circles trapped an otherwise clear player. Fix uses actual circles for player, then relative swept positions for runner commit; no relaxed overlap threshold. GREEN escape/destination/group resume.
- Real greeting uses the right arm (the existing rig only waves upperArm_R); test asserts the actual bone quaternion, not a text-only response.
- UI removes observer mode, ground-click closes selected menu and walks; nearby wave, pause squad, existing audio/help/home remain. Display red-scarf template now豆包, stable ID/model unchanged.
- First usable checkpoint is scoped; no source-pin edits or shared World/App/domain changes. Full ordinary is running in parallel for main integration; do not mislabel it completed.
