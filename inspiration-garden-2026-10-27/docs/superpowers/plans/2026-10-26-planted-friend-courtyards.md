# Planted Friend Courtyards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the three sparse new friend estates into planted, walkable gardens and gently frame Kelly's established courtyard.

**Architecture:** Author existing composition JSON, sync generated gardens data and add approved new plants through existing immutable catalogue/art paths. Keep all navigation/economy/camera systems unchanged.

**Tech Stack:** Vanilla JS Canvas, JSON assets, node:test, Python image proof renderer.

**Spec:** `docs/superpowers/specs/2026-10-26-planted-friend-courtyards-design.md`

## Global Constraints
- Existing buildings retain style, coordinates, footprint and count; Jiji ground-contact-only correction requires separate approved contract.
- No old variety identity, price tier, player save, entry zoom or terrain-edge regression.
- No browser/headless automation here; root owns supported CUA/native QA and publication.
- Plant assets are new separate IDs, 1×1; no source/raw/staging files enter public build whitelist.

## Review Focus
- Dense planted borders must not isolate empty support cells or remove exterior plant stance.
- Repeated same-species displays must retain real daily claim semantics and immutable attribution.
- Decorative wall/fence segments must leave actual building/arrival openings.
- Jiji ground contact and actual mobile framing require real renderer proof, not a diagram.
- New assets must preserve alpha, metadata correctness, source bounds and bounded loading.

### Task 1: Planted courtyard data and catalogue
- [x] Write new failing authored-layout tests: richer grouped planting, 55% free minimum, fixed buildings, short boundaries and explicit access gaps; update prior exact-count expectations to new approved scope.
- [x] Run focused tests and record expected failures against v24.
- [x] Add new canonical plant definitions; integrate approved art metadata/assets only. Modify composition rows/cells/plants/edges, retaining all old object IDs. Sync source.
- [x] Verify graph connectivity, every real plant approach, building entries and daily seed claim behavior. Run focused and full tests.

### Task 2: Visual verification and handoff
- [x] Integrate separately approved Jiji contact correction under its own tests if delivered.
- [x] Capture createScene draw commands and rasterize actual four-island entry proof, plus wider scene views to inspect all beds/edges.
- [x] Inspect images and iterate data only if paths, planted grouping or actor visibility fail.
- [ ] Run `npm test`, `npm run check`, `npm run build`, `git diff --check`; get independent review and resolve findings.
- [ ] Commit candidate and deliver exact hash, tests, runtime budget and proofs to root. Do not publish.
