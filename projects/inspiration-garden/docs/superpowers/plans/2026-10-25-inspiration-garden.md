# Inspiration Garden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Track checkboxes.

**Goal:** Deliver a separate polished, offline-sample, personal-creative planting demo for morning acceptance.
**Architecture:** Buildless Canvas2D isometric scene with DOM controls, pure state transitions and local save. Assets supplied independently by art director; renderer reads a manifest and atlas source rectangles. No live service calls.
**Tech Stack:** HTML, CSS, JavaScript ES modules, Canvas2D, WebAudio, Node built-in tests.
**Spec:** ../specs/2026-10-25-inspiration-garden.md

## Global Constraints
- Never alter or publish old manor; new isolated directory and storage key.
- 4 initial land cells; no fishing; one variety per seed; one crystal per successful new variety.
- 4 building kinds only, land is sole plantable terrain.
- Offline creative samples and demo gardens visibly labeled; no real payments/API secrets/private photo uploads.
- Preserve original author through propagation and parent provenance through remix.
- Parent owns Site creation/save/publication, no worker deploy/push.
- Mobile full-screen, transparent image plant assets, immediate local interactions.

## Review Focus
Repeated clicks cannot double spend or duplicate harvest/seed claims. Daily quota shared across same variety copies. Reload and midnight rollover do not reset balances incorrectly. Building relocation cannot strand planted assets/avatar. Unknown prompt must not be presented as successful arbitrary AI generation; storage failures/corruption cannot silently erase progress.

## Task 1: Game rules and state, complete playable shell
Files: index.html, styles.css, src/catalogue.js, src/state.js, src/storage.js, src/app.js, src/scene.js, src/interactions.js; tests/state.test.js, tests/storage.test.js; README.md.
Interfaces: createState(now,uid), reduce(state,action,now), tick(state,now), save/load with injected storage; catalogue varieties have id, name, authorId, authorName, parentId, rootId, artKey, interaction, seedPrice, salePrice, growMs. Atlas manifest entries provide image, frame x/y/w/h and normalized anchor, optional layers. Art director controls assets/art-manifest.json, engineer adapts only renderer mapping.
- [ ] Write failing Node tests for initial balances/4 land, plant/elapsed maturation/sell, one-time crystal debit/cancel, deterministic same-variety planting, daily claim, provenance propagation, land-only planting and safe relocation.
- [ ] Implement bounded state operations and injected clock/storage. npm test or node --test tests/*.test.js must pass.
- [ ] Implement full-screen renderer/UI, path-independent tap travel, sheets and gesture-driven interactive plants. No long queue that can block home travel.
- [ ] Integrate artist manifest, limit image memory, test unknown/missing art fallback while loading (not final placeholders).
- [ ] Add three distinct demo gardens, interact-then-claim rule, creation and limited sample matching, simulated crystal purchase clearly marked.
- [ ] Verify fresh/reload flow, repeated actions, mobile viewport, audio gesture/mute, construction edit/cancel and visit-home reset. Record test evidence and limitations.
- [ ] Create local commit on feature branch, full diff for independent reviewer. No push/deploy.

## Task 2: Independent acceptance and polish
- [ ] Fresh reviewer checks full spec/diff and exercises state edge cases; browser QA via supported cloud browser if available, disclose if blocked.
- [ ] Art director reviews actual scene screenshot and fixes asset/UI mismatch, engineer fixes important findings. Do not expand scope.
- [ ] Run full tests/checks, verify no actual network generation/payments and old Site remains unchanged.
- [ ] Package source and deployment archive after parent approval, save separate new private/unpublished Site as appropriate; request user approval immediately before public publication unless explicitly granted.

## Rulings
Latest schedule supersedes first-version finish estimate:4 stages each~60min, total~4h, first playable is intermediate only. Stage1 core interaction/rules, stage2 art and rich interactive plants, stage3 bespoke3garden compositions, stage4 actual playtests/fixes/polish. Public publication of THIS new demo explicitly approved by user at15:34:09UTC; parent owns new Site public creation/deploy, no further ask needed. No need consume exact hour doing nothing if stage quality passes, but use remaining budget to raise quality and evidence instead of shipping placeholders.
One implementer owns integrated code, one independent reviewer; art specialist owns imagery. This follows user's lean team preference. No extra project-role agents. First full playable target about 60–90 minutes; polish and recoverable fixes may continue overnight until morning; do not auto-publish publicly.
