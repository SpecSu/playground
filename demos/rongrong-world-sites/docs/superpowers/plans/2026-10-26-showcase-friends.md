# Showcase friends implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Honest sample friends with safe, temporary farm visits.
**Architecture:** Separate in-memory session and visitor World; canonical home instance stays untouched. Independent sample target boarding adapter.
**Tech Stack:** Existing React/TypeScript/Three.js, node:test, CPU DOM/renderer fixture.
**Spec:** docs/superpowers/specs/2026-10-26-showcase-friends-design.md

## Global Constraints
- Never write sample state into ordinary localStorage, canonical farm, authority or outbox.
- Only released assets; no browser, GPU claim, new generation, publication or access changes.
- MinimalApp hooks remain integration owner's responsibility.

## Review Focus
- Rapid farm switches discard stale async deliveries and pending arrivals.
- Carry never survives Home/disposal/reload or changes owner.
- Direct forbidden command calls cannot bypass hidden UI.
- Greeting and sample boarding cannot mint formal rewards.
- Mobile drawer has scrollable rows, accessible 44px controls and truthful sample labels.

### Task 1: Curated samples and session capability boundary
Files: src/minimal/sample-farms.ts, visitor-session.ts; tests/minimal-visitor-session.test.ts.
Interfaces: sampleFarm(id,now); VisitorSession.sample(id,now), command(input,token), tick(now,motion), token, dispose, refresh.
- [x] Write failing capability, isolation, carry lifecycle, stale async and navigation tests.
- [x] Run targeted tests, observe missing exports.
- [x] Implement sample data and in-memory session allowlist.
- [x] Run targeted and baseline suite.
- [x] Commit.

### Task 2: Reference-inspired drawer and visitor view
Files: FriendsPanel.tsx, VisitorFarm.tsx, friends.css; tests/minimal-friends.dom.mjs and CPU fixture/test wrapper.
Interfaces: FriendsPanel({onVisit,onClose}); VisitorFarm({sampleId,onHome,onFriends,boardingAdapter?}).
- [x] Write actual React/World CPU tests for labels, sorting, temporary interactions, navigation and cleanup.
- [x] Run RED.
- [x] Implement drawer and visitor controls, with epoch-checked approach intents and question-mark help.
- [x] Run GREEN plus typecheck; hand minimal home hook instructions to integration owner.
- [x] Commit.

### Delegated integration and demo work
- [x] Parent explicitly assigned isolated per-user sample boarding adapter/UI. Pure state-machine tests cover success/failure/cancel/expiry, bad targets, per-user identity, and idempotency.
- [x] Runtime integrator explicitly delegated MinimalApp single-writer hooks from 07968b8, plus canonicalFarmLocks from 88d2dc. Actual App/World CPU test covers pending refusal, old arrival, late GET, visibility, paused ticks, original camera/actor/economy and real-boarding routing.
- [x] TDD fixed superseded demo poll success/error and drawer focus-stealing.
- [x] TDD added PhoneViewport-aware 44px physical touch target contract and proportional drawer height.

Validation recorded before final integration: 889/889 full Node tests; actual friends/App/P0-network DOM 12/12; explicit source lint and typecheck. The touch test and yaw-aware scenery clearance regression are included. No browser/GPU inspection or publishing occurred.
