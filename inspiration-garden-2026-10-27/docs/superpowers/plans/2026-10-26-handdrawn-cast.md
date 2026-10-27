# Handdrawn Cast Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support the artist's handdrawn12-role cast consistently in world and everyportrait without changinggameplay.

**Architecture:** One small reference adapter normalizes legacystring and structuredportrait assets. ExistingCanvas assets pipeline loads unique criticalsources and lazily repaints portraitcanvases; DOM routes/state remainunchanged.

**Tech Stack:** BrowserESmodules, Canvas2D, node:test.

**Spec:** `docs/superpowers/specs/2026-10-26-handdrawn-cast.md`

## Global Constraints
- Stable12IDs/names/settings/save; no gameeconomy/schema/interactionchanges.
- Artist owns assets/manifest, parent publishes; no originalmanorwrites.
- Legacystring portraits stay supported; no hardcoded oldwebp fallback onnewmanifest.
- Asset completion paints canvas only, never fullDOMrerender/inputfocusloss.

## Review Focus
- Portrait object accidentally becomes '[object Object]' URL (Task1).
- One shared front/back/portrait image wrongly reports notready due URLcount1 (Task1).
- Failedportrait but successfulbody changesselectedavatar anyway (Task2).
- Friendcards or HUD stilluseoldwebp whileworldnew2D (Task2).
- Lazyassetcompletion resetsfocused creationinput (Task2).

### Task1: Reference / loader / packaging
**Files:** new `src/avatar-references.js`; `src/assets.js`, `scripts/build.mjs`; `tests/avatar-references.test.js`, `tests/assets.test.js`, `tests/build.test.js`.
**Interfaces:** `imageReference(value)` returns `{image,frame?}|null`; `avatarImageURLs(avatar)` unique front/back/portrait URLs; `loadAvatar(key,{retry})` returnsboolean readiness; `portraitThumb(canvas,key)` cropsframe, fittingwholeportrait.
- [x] Write legacy/structured/sharedURL/invalidref and crop/readiness/build tests; verifyRED.
- [x] Implement adapter and criticalselected/lazyothers load behavior; verifytargeted+fullGREEN.
- [x] Commit tested asset-supportslice withoutartistassets.

### Task2: All UI surfaces / selection safety
**Files:** `src/ui.js`, `src/app.js`, `styles.css`; `tests/ui.test.js`, `tests/app-lifecycle.test.js`.
**Interfaces:** `canvas[data-avatar-portrait=id]` onHUD/profile/friendcards; paintThumbs calls portraitThumb, selectioncalls loadAvatar beforeexisting latest-choicecommit.
- [x] Write allsurface/nohardcodedURL, failedportraitretainsactor, sharedload and lateassetnofocusloss tests; verifyRED.
- [x] Implement canvasmarkup/styles and selectionintegration; verifytargeted+fullGREEN.
- [x] Commit minimalruntimecandidate, awaitartistapprovedmanifest, then fulltest/check/build and independentreview.
