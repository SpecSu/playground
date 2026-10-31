# Terrain Appearance DIY Implementation Plan

> **For agentic workers:** Native single-writer execution via superpowers:executing-plans; independent branch review at completion.

**Goal:** Saveable four-choice ground appearance DIY and a shared lunar sample contract.
**Architecture:** Optional tile scalar, strict enum authority command and import, existing central farm commit. Renderer blends appearance independently from ecology and physical water/height.
**Tech Stack:** TypeScript, React, Three.js, Node CPU tests and existing DOM fixture.
**Spec:** `docs/superpowers/specs/2026-10-26-terrain-appearance-design.md`

## Global Constraints
- Base published v30 `adc12752`; isolated tree, no source release edits/publication.
- No fees, egg use, new models, physics heights, ecology/unlock changes, browser/CUA or paid API.
- Shared tile contract `appearance?: 'natural'|'lunar'|'slate'|'rose'`; command `paintTerrain {at,appearance}`.

## Review Focus
- Missing/unknown/future/object styles and old v2/v3 save/import raw bytes.
- Pending/duplicate/lost-ACK command replay and existing wishing/boarding locks.
- Painting under a moving actor must preserve route, root position, water/egg/supply semantics.
- Blend seams and style reset must update textures/cache without leaking geometry/materials.
- Water/shop/unowned targets reject; sample visit stays read-only and isolated.

### 1. Domain/save contract
Files: `terrain-appearance.ts`, `model.ts`, `authority.ts`, `tests/minimal-terrain-appearance.test.ts`.
- [x] Write RED tests for paint/reset, malformed requests/saves, water/shop/unowned rejection, no cost/ecology changes, cloud/import/idempotency.
- [x] Add pure enum/labels/eligibility helper, command, strict save/import validation; preserve absent field compatibility.
- [x] Run domain, save, authority, timeline, boarding, egg tests.

### 2. Render contract
Files: `terrain-field.ts`, `terrain-ground.ts`, `scenery-art.ts`, terrain caches as necessary; render tests.
- [x] Write RED tests for distinct lunar palette, continuous boundaries, changed/reset texture bytes, exact vertex/contact-height invariance.
- [x] Blend style independent of terrain, bounded procedural moon dust/crater appearance, update style stamps/fallback accents.
- [x] Run terrain/World CPU tests and verify no movement reset or water change.

### 3. Working UI and verification
Files: `TerrainAppearance.tsx`, isolated CSS, `MinimalApp.tsx`, `CreativeStudio.tsx`, DOM tests.
- [x] Write RED actual component/App interactions for selector/reset/underlying ecology and honest locked generation label.
- [x] Attach editor through existing settings and CreativeStudio callbacks with pending/error handling.
- [x] Full author tests, all DOM, type/lint/build; isolated commits to main integrator only.
- [ ] One independent review on the four-sample + DIY combined source (main integrator owns this gate).

Ruling: lunar detail uses color shading only; existing normals stay byte-identical as well as heights. This is safer for the established contact pipeline and within the approved appearance-only scope.
Evidence: `docs/terrain-appearance-verification.md`.
