# Garden Play Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Improve idea discoverability, inventory clarity, tactile construction and truthful walkingfacing.
**Architecture:** UI-only dice/seedmerge first. One small construction-clock module feeds atomicstate guards, storagevalidation, sharedsupports and walking; scene derivesprogress withoutpersistentticks. Facing mapping follows artistaudit.
**Tech Stack:** ESmodules,Canvas2D,DOMtrays,node:test.
**Spec:** `docs/superpowers/specs/2026-10-26-garden-play-polish.md`

## Global Constraints
- Newbasic3s/personal15s; reserve/payonce, no completionrewards, legacytiminglessfinished.
- No unfinishedsupport/walk or unsafegraphmoves; exactrestoredoesnotrestartwork.
- Only3bagtabs; knowninfo/provenance/artsealing retained.
- 🎲fillonly/exactsupportedtext/noimmediaterepeat; fixedparentexcludesidentical.
- Existing193tests retained/adaptedclock; no publish/backend/newgenerativeclaims.

## Review Focus
- Repeatclick/reload cannotdoubledebit orfinishforfree (Task2).
- Pendingtilebridge/edge-support move breakscompletedwalkgraph (Task2).
- Partial/malformedtiming acceptedandpoisonslegacyrecovery (Task2).
- Dicefill triggerssubmit orlosesfirstfocusedclick (Task1).
- Mirroring fixesonefrontdiagonal butreversesback/identity (Task3).

### Task1: Dice and mergedseeds
Files:src/ui-state.js,ui.js,app.js,styles.css; UI/controller tests.
- [x] RED exact3examples/support/nonrepeat/remixexclusion/nocharge/errorclear;3tabs/positivefirst/zerostocksource/detail/sealed tests.
- [x] Implement boundedUIonly; fullGREEN,commit.

### Task2: Construction clocks,occupancy andsaves
Files:newsrc/construction.js;state.js,storage.js,footprints.js,visual-walk.js; construction/storage/walktests.
- [x] RED3s/15s/costonce/reload/legacy/timingmalformation/blockedactions/support/graph/route tests.
- [x] Implement optionalpairedtimestamps,atomicguards,completegraphchecks andfilteredwalking; adaptolderinstantfixtures toexplicitelapsedtime; fullGREEN,commitforreview.

### Task3: Worksites andfacing
Files:scene.js,scene-math.js,app.js,ui.js,visual-walk.js,README; scene/controller/facingtests;artistmanifestownedexternally.
- [x] RED pendingwork hit/progress/nointeraction andcompletionview-only;4screen-direction/facingmapping tests fromactualaudit.
- [x] Implementgenericworksite/fallback,view-onlyprogressrefresh,calibratedfacing; fulltest/check/build andindependentreview.
- [x] Commitcoherentcandidate,parentnativeQA/publication only.
