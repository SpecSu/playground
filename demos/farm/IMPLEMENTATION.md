# Farm complete playable loop Implementation Plan

> For agentic workers: use superpowers:executing-plans inline, with test-first changes and one independent final review.

**Goal:** LX enters the saved farm, taps animals, completes care→learning→memory→wool→stage without waiting hours.

**Architecture:** Keep React/Three/Vite + local transactional SQLite. Upgrade versioned state in store; keep rules pure, isolate picking/presentation helpers, retain shared Feed/camera.

**Tech Stack:** existing Node24/TypeScript/React/Three.js, no external service.

**Spec:** [GAMEPLAY.md](./GAMEPLAY.md)

## Global constraints

- Same branch/worktree and localhost5190, preserve Cookie/SQLite; backup before server replacement.
- Fixed390×844 Feed, overlays/sheets only; original assets including human-lx.
- No browser control except independent Chrome plugin, no Sites/GitHub push.
- Finite relationship growth, no absence penalty or wool multiplier, transactional receipts.

## Review focus

- Legacy animal avatar migrates toLX exactly once, without discarding progress.
- Pointer capture/lost capture, label taps, joystick movement never open wrong card.
- Failed save/rapid gestures/delayed replies never award a different pending operation.
- Company after refresh/long absence and repeated new IDs cannot earn credit.
- Natural milestones reach8wool before stage purchase without demo advancement.

## Task1 — state, LX and care/economy

Files: src/model.ts, src/journey.ts, server/store.ts; tests/model.test.ts, store.test.ts, complete-loop.test.ts; public/avatars/{cast-v1,portraits}/human-lx.*.

Interfaces: Avatar adds human-lx; Farmv2 adds care, company session and book; upgradeFarm(raw) preserves legacy; journey(Farm) returns ready/claimed objectives. Commands inspect/feed/company/finishCompany/cancelCompany/questClaim.

- [x] Tests first: LX initialization, migration once, feed45s/3-credit cap, company20s/60s expiry/refresh abort/repeat, quest precondition/repeat/reopen, natural8wool→stage.
- [x] Watch failures via npm test, implement rules/store upgrade, copy original LX assets.
- [x] Run suite/typecheck; commit tested state slice.

## Task2 — real picking and complete Feed cards

Files: src/picking.ts, animal-view.ts, world.ts, sheep.ts, main.tsx, FarmView.tsx, ResidentCard.tsx, JourneySheet.tsx, style.css; tests/picking.test.ts, feed-continuity.test.ts, assets.test.ts.

Interfaces: SceneTapGesture guards release; pickSceneEntity honors nearest visible hit. onInspect(id) selects+opens resident/guardian. Cards consume snapshot/animal/event/now; all mutations use pending lock and explicit retry. Company drives proximity/countdown, feed drives chew/grass.

- [ ] Tests first: real Three geometry pick sheep/guardian/occluder, drag/cancel/multi-pointer suppression; card ID/all habits/status/food/company/appearance, LX, journey, dialog continuity.
- [ ] Watch failures; implement tap release and labels, guardian card, avatar picker, care/journey/status UI, timed feedback.
- [ ] Pending save disables mutations, explicit retry preserves command; DOM verifies card switching and drawer lifecycle.
- [ ] Full suite/lint/typecheck/build; commit playable UI slice.

## Task3 — evidence and Mac handoff

Files: scripts/complete-http-smoke.mjs, README.md, GAMEPLAY.md, PROGRESS.md.

- [ ] Isolated server/db: HTTP initialize, inspect/feed/company, rewards/repeats/LX/reload. Test clock via pure/store construction only, never production API.
- [ ] Independent review; fix important findings with regressions; full tests/lint/typecheck/build.
- [ ] Consistent SQLite backup; replace only recorded farmPID, independent session same5190, logs/PID; correct cwd/listener/assets/API and cross-call survival.
- [ ] Record evidence/Chrome limit; final local commit and deliver URL/path/checks. No push/deploy.
