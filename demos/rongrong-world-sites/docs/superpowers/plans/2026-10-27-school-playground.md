# School Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add an isolated fifth sample with a real32×24m campus and eight shared-template red-scarf runners.
**Architecture:** Dedicated visitor world, pure capsule/formation model, procedural scenery, real-run instance adapter. Parent retains existing home world and official data.
**Tech Stack:** Existing TypeScript/Three/React, Node CPU/DOM tests, no new dependencies.
**Spec:** docs/superpowers/specs/2026-10-27-school-playground-design.md

## Global Constraints
No frozen r4 edits/publishing/new API/paid calls. No walk-speed fake, UID aliases or transferable sample assets. Opaque verified asset scope retained. Own only new playground modules/tests until main authorizes card/Visitor routing hunks.

## Review Focus
- Invalid run/late load: no visible placeholders or resurrected disposed instances (task2).
- Capsule seams/curves: actual eight skin envelopes, stable ordering and spacing (tasks1/4).
- Hidden/blur/large dt: no catch-up animation or queued action (tasks2/3).
- Shared resources: one parsed GLB, independent skeletons, clone disposal cannot kill siblings (task2).
- Mobile/keyboard: follow/overview readable and controls cannot move home actor or mutate store (tasks3/4).

### Task1: Pure layout and formation; procedural scenery
Files new playground-layout.ts, playground-formation.ts, playground-scenery.ts; tests/minimal-playground-layout.test.ts and scenery.test.ts.
Interfaces capsulePoint(distance,offset)→{x,z,heading}; laneDistance(progress,offset)→actual metres; PlaygroundFormation.tick(dt),setPaused,snapshot; SCHOOL_PLAYGROUND_LAYOUT immutable bounds32×24/r6/halfStraight6/two columns/four rows/spacing2/1.4.
- [x] RED tests: continuous wrap/heading, spacing every5cm, lane travelled distance, invalid dt/pause, actual ground/decor bbox and triangle budget.
- [x] Implement minimal analytic path and immutable8-instance state; scene meshes/cached geometry disposal.
- [x] GREEN tests and commit independently.

### Task2: Real run asset and formation scene
Files new playground-run-contract.ts, playground-scene.ts; tests/minimal-playground-scene.test.ts, actual.test.ts.
Interfaces run spec from rig owner; Scene(parent,library,spec),ready,tick,setPaused,command,snapshot,dispose. Exactly red-scarf template,8 clones, no world/save dependency.
- [x] RED real-loader/synthetic tests forone fetch/eight skeletons, missing run failure, malformed spec, forbidden commands, paused tick/dispose/late success.
- [x] Implement run contract and real animation mixer advancement from lane distance; no fallback clip.
- [x] GREEN unit tests; actual final GLB stanza/flight/skin/curve validation when supplied; commit.

### Task3: Dedicated rendering and view lifecycle
Files new SchoolPlaygroundWorld.ts, SchoolPlayground.tsx, playground.css; tests/minimal-playground-world.dom.mjs/view.dom.mjs.
Interfaces World(host,library,spec,handlers),setVisible,select/command,viewMode(follow|overview),zoom,dispose. One RAF. View receives onHome/onFriends/viewerKey like existing visitor.
- [x] RED actual Three renderer-injected tests and React lifecycle tests forHUD fit, pointer select, pause/rebase, modal/blur/hidden, stale import, no home/store changes.
- [x] Implement dedicated camera/scenery/scene/render lifetime and compact accessible controls.
- [x] GREEN DOM/geometry tests; commit.

### Task4: Minimal fifth-card integration after r4 freeze
Files exact shared hunks coordinated withmain: sample-farms/FriendsPanel/VisitorFarm route. No World/MinimalState/global bounds edit.
- [ ] RED fifth example/boarding exclusion/return-to-home unchanged tests.
- [ ] Attach card and separate visitor route only after run admission; preserve all old themes.
- [ ] Fresh ordinary/DOM/type/full lint/build; final independent review and deliver exact commits, no publish.

## Execution ledger
- Base a9cb1ef:1038 tests,1036pass/2explicit skips/0fail; no packages installed.
- Task1 RED: missing layout/formation/scenery modules; GREEN7 CPU tests, typecheck0. Initial focused lint had ignored-file warnings; it was NOT full lint coverage. Later explicit `--no-ignore` checks cover the new modules. Geometry ground top uses1e-7 Float32 tolerance; prop clearance checks individual actual mesh AABBs (not whole-fence hull containing empty interior).
- Ruling: dedicated World approved by main; default follow-team view plus overview preserves mobile readability without reducing physical stage size. Local-only observer policy avoids changing navigation/domain.
- Ruling: cloud skill scripts have no local executable path, so this committed ledger carries checkpoints instead of invoking unavailable sdd helper scripts.

- Task2 RED→GREEN: real parser fixture, single fetch/eight skeletons, fail-closed run/hash/contact contract, rejected commands, late loads, raised-track support, normalization/body budget. Actual public admission initially null failed its byte-binding test, then exact frozen derivative was admitted. No lunar catalog changes.
- Task3 RED→GREEN: actual Three/React lifecycle, mobile HUD, posed picks, modal/blur/hidden, viewer epoch, zero storage, renderer allocation/disposal, context loss and duplicate-restore loop. The duplicate-restore RED required a counting RAF stub (default fixture returns constant0 and would not expose the fault).
- Author final: ec15c61… (1,792,648B), real run0.6000000238418579s, stride0.44792210534943105m. Root accepted original clothing seam limitation; no re-rig or visual-flawless claim.
- Actual CPU evidence: 16,000×60Hz steps / 3.22657laps; 0.5m conservative pair gap, 3.906mm worst contact-window drift, flight17.157mm. Actual World96/96 posed picks, min27.77px actor height in follow view across mobile/desktop.
- Identity handoff: fifth is 咕咕, avatar from identity commit b99b348, unlinked-account. No fabricated UID. Avatar byte addition and four existing names remain identity owner's changes.
- Task4 ownership changed by main's urgent P0: do not edit shared VisitorFarm/FriendsPanel/World/friends.css. Supply precise routing/card hunks in docs/evidence/school-playground-integration.md; final combined App/pending/home-camera validation belongs to main after P0 freeze. New branch never enters current release automatically.

- User UI correction (04:14 UTC, before freeze): remove permanent eight-runner bottom bar. Added compact view/pause/picker controls, selection-only information, on-demand keyboard picker with focus handoff, explicit observation hint; no dummy player. Follow/free camera blends over0.45active seconds. RED confirmed permanent8bar, immediate camera jump and missing picker focus; GREEN covers no jump/hidden pause/settled endpoints and focus.
- Pre-correction fresh full ordinary1052pass/2existing skips/0fail; full DOM118/118 with both HappyDOM and tests/view-loader imports. A first DOM command omitted view-loader and failed TSX loading, not a product failure. Post-correction UI/World checks are rerun before freeze.
- Post-correction fresh validation: all DOM119/119; typecheck0; explicit full-source `eslint --no-ignore src server tests app components hooks lib scripts`0; build0; actual eight-GLB World96/96 picks unchanged (27.767px minimum follow height). No shared P0 files or manifest pins changed. Final ordinary rerun pending at this ledger entry.
- Final post-correction ordinary rerun:1054tests,1052pass,2existing explicit skips,0fail (293.6s). Combined with119/119DOM, typecheck0, explicit full-source lint0, build0 and fresh96 actual-GLB World picks. Module input frozen for independent review; fifth-card routing remains the explicitly coordinated main integration hunk, not silently published.
