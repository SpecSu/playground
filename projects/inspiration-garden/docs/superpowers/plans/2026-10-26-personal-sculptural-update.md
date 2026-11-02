# Personal Sculptural Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign cat/silver necklace, replace the shoe with a hovering Roadster, and add X-T50/scallop/tarp personal samples, preserving existing saves, the unchanged pen and compact-price fix.

**Architecture:** Stable sample/art identities resolve through updated metadata and lazy-loaded bitmaps. Cat feeding receives measured geometry, while Roadster hovering is a pure time sampler driven by ephemeral exhibit control state; all occupancy/economy remains untouched. Independent art workers hand off assets/landmarks to one runtime/data/test integrator.

**Tech Stack:** Existing ES modules, Canvas 2D, Web Audio, JSON manifests, transparent WebP assets, Node built-in tests; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-personal-sculptural-update-design.md`

## Global Constraints

- Active existing IDs: `fluffy_cat_cottage` `[2,2]`, `necklace_memory_monument` `[2,2]`, `airforce_memory_house` `[2,1]`; new IDs: `xt50_memory_camera` `[1,1]`, `scallop_shell_house` `[2,2]`, `camping_tarp_pavilion` `[2,2]`.
- Keep yellow LAMY pen entirely unchanged; do not add seaside film/umbrella subjects. Root approved exactly three independent idempotent starter blueprints, one per new sample direction; no other starter or currency grants. Preserve normal creation cap 100 and allow only the three validated migration reserve slots.
- Preserve blueprint/instance/root/parent/author identities, existing prices, timing, navigation and existing compact-price changes. Preserve other three NPC estates; Kelly follows the separately approved Wonderland plan.
- Keep original cat photo byte-identical, `user-provided-photo`, `提供于 2026-10-26`.
- Hero/interaction/source assets remain lazy-loaded, with measured alpha bounds, crop and ground anchors.
- Roadster lift is 12 CSSpx at zoom1, normal duration1800ms, reduced duration650ms with zero lift/jets.
- The user explicitly requested public-link publication of this batch; root alone packages and deploys after final review.

## Review Focus

- Old owned and legacy-bag saves must resolve to the new art without identity, footprint or money changes (Task2).
- Stale album frames are still copied by build; old shoe/ornate-necklace source references must truly leave the runtime manifest (Task2).
- Cat animation can be geometrically correct but show rectangular seams; validate its matched atlas on actual backgrounds (Tasks3,6).
- Rapid taps, reduced motion and hide/return must not leave the car floating or restart stacked effects (Task4).
- Async image loading and narrow screens must retain pen/camera framing and the compact-price UI (Task6).

---

### Task 1: Independent art packages, without shared-manifest edits

**Files:** Create the runtime image files named in the spec and per-subject landmark sidecars under `work/`; read existing references below. Art workers do not edit `src/` or shared manifests.

**Interfaces:** Each handoff provides `{image,size,frame,anchor,alphaBounds,width,footprint,renderPivotCell,depthPivotCell}`. Cat also provides six face frames plus `{referenceSize,faceCenter,faceWidth,fishStart,fishControl,fishMouth}` in frame-relative source pixels. Necklace provides normalized `pendantAnchor:[x,y]`; car provides normalized `jetAnchors:[[x,y],...]` in its cropped frame. New trio handoffs additionally supply local lens/rib-glow/lantern/cloth landmarks. Source images include dimensions and matching transform cues.

- [ ] Generate/review the cat hero and matched six-frame atlas as one visual package; unchanged cat photo and existing fish asset remain references, not replacements.
- [ ] Generate/review the modern silver-necklace hero and matching modern source image; reject ornate gold-chain or Gothic-arch remnants.
- [ ] Generate/review the grounded Roadster hero and matching conceptual source image; assert +x rear-upper-left/nose-lower-right orientation and two-cell ground fit.
- [ ] Receive the assigned trio worker's X-T50/scallop/canopy heroes and matching source cards; validate exact 1×1 / 2×2 / 2×2 framing, contemporary shell language and a reachable-looking canopy overhang without a seated-avatar requirement.
- [ ] Verify real transparency, image dimensions, safe margins, no metadata or baked labels; record measured landmarks and byte sizes. Deliver exact paths to integrator before manifest wiring.

### Task 2: Identity-safe data and source wiring

**Files:** Modify `src/blueprints.js`, `src/ui-state.js`, `assets/art-manifest.json`, `assets/memory-album-manifest.json`; test `tests/personal-source-cards.test.js`, `tests/memorial-footprints.test.js`; create `tests/personal-sculptural-assets.test.js`.

**Interfaces:** Consume Task1 measured assets. Preserve the three old sample/art keys and source types; expose `roadster-rocket-memory-photo` for the car, unchanged cat/necklace frame IDs. Add sprite `pendantAnchor`, `jetAnchors`, and cat `catFeeding` geometry with Task1's fields. Display/source copy is exact in spec.

- [ ] Write failing assertions: three stable IDs resolve to expected new names/footprints; cat source path/date/provenance match baseline; pen sample, sprite and album frame deep-equal baseline; no abandoned film/umbrella subject exists; old shoe source frame and old ornate source path are absent from runtime album; all new frame files exist.
- [ ] Run `node --test tests/personal-source-cards.test.js tests/memorial-footprints.test.js tests/personal-sculptural-assets.test.js`; verify failures identify missing changes, not test setup.
- [ ] Update sample metadata/suggestions and the measured hero/atlas/source entries. Set car interaction to `hover`; necklace remains `chime`, cat remains `meow`. Remove obsolete source references rather than only changing labels. Add only the three explicitly selected new sample IDs and their source frames/suggestions; add the three approved starter directions independently, once, without duplicating existing owned directions. Test new IDs through normal CREATE_BLUEPRINT, construct, relocation and save roundtrip at their exact footprints.
- [ ] Extend legacy-save/packed-return test to assert exact blueprint and instance IDs, footprint cells, money and authorship before/after load and restore. Run the preceding command plus `node --test tests/identity-compatibility.test.js tests/paid-buildings.test.js` and require PASS.
- [ ] Keep shared integration changes uncommitted until the combined root review.

### Task 3: Matched cat feeding geometry

**Files:** Modify `src/cat-feeding.js`, cat call site in `src/scene.js`; test `tests/cat-feeding.test.js`.

**Interfaces:** Preserve `catFeedingSample(elapsed,reduced=false,geometry=DEFAULT_CAT_FEED_GEOMETRY)` and `drawCatFeeding(ctx,assets,body,elapsed,reduced=false,geometry=DEFAULT_CAT_FEED_GEOMETRY)`; add optional geometry without breaking old callers. Export default geometry matching legacy source `[1254,1254]`, faceCenter`[456,456]`, faceWidth368, fishStart`[1320,980]`, fishControl`[850,-70]`, fishMouth`[420,480]`. `scene.js` passes `sprite.catFeeding`. Compute x/y scaling from body and referenceSize, not a guessed square crop.

- [ ] Add failing tests with a deliberately nonlegacy referenceSize/faceCenter/mouth: draw coordinates and fish endpoint scale correctly; legacy defaults remain byte-for-byte equivalent in existing assertions; sequence still ends at3000ms/950ms and repeats still coalesce.
- [ ] Run `node --test tests/cat-feeding.test.js`; require expected missing-geometry failure.
- [ ] Implement optional geometry and pass new sprite metadata. Keep state names/timing and fish visibility rules; do not animate the building base.
- [ ] Run `node --test tests/cat-feeding.test.js tests/exhibit-controls.test.js tests/assets.test.js`; require PASS. Inspect six states on cream, green and aqua backgrounds for face-boundary seams before accepting the package.
- [ ] Include reviewed cat files in the final combined root-approved integration commit.

### Task 4: Pure Roadster hover and relocated necklace response

**Files:** Create `src/roadster-hover.js`, `tests/roadster-hover.test.js`; modify `src/exhibit-controls.js`, `src/scene.js`, `src/interactions.js`, `src/content-framing.js`; extend `tests/exhibit-controls.test.js`, `tests/interactions.test.js`, `tests/content-framing.test.js`, `tests/app-lifecycle.test.js`.

**Interfaces:** Export `roadsterHoverSample(elapsed,reduced=false) -> {active,lift,jetAlpha,shadowScale,shadowAlpha}` with finite bounded values, lift in CSSpx at zoom1. Invalid/negative/finished elapsed returns inactive grounded values. Control kind/event is `hover`, state timestamp is `hoverAt`. Standard timeline: grounded through250, rise to12 by650, hold through1100, descend to0 by1650, inactive at1800. Reduced: lift0/jetAlpha0 throughout, inactive at650. Shadow ground position never moves.

- [ ] Write failing pure tests for `-1,0,250,650,1100,1650,1800,Infinity,NaN`; assert exact lift endpoints, finite values, bounded jets, grounded terminal state and reduced-motion zero lift/jets. Add event test: first press emits one hover event, second within1800ms emits none and preserves hoverAt, later press restarts; pointer release preserves finite sequence.
- [ ] Run `node --test tests/roadster-hover.test.js tests/exhibit-controls.test.js`; verify expected missing-helper/behavior failures.
- [ ] Implement pure sampler and `hoverAt` control; add one quiet bounded event sound through existing audio budget/mute rules, no looping audio or new downloaded samples. Add exact hint `轻碰车身，贴地升起一点，再轻轻落回原处`.
- [ ] Add scene tests using existing canvas stubs: body and art-hit y translate by `-lift*zoom`; footprint/depth/ground shadow center do not; clearing scene activity resets hoverAt. Update render to draw local jets from sprite.jetAnchors and use sprite.pendantAnchor for necklace chime. Do not move navigation data.
- [ ] Add content-framing test that car top gains12px safe headroom while other items including pen are unchanged. Add lifecycle test that hiding/changing/removing car resets hover and prevents stale return; implement these hooks.
- [ ] Run `node --test tests/roadster-hover.test.js tests/exhibit-controls.test.js tests/interactions.test.js tests/content-framing.test.js tests/app-lifecycle.test.js tests/memorial-footprints.test.js tests/solid-building-paths.test.js`; require PASS.
- [ ] Include reviewed control/scene files in the final combined root-approved integration commit.

### Task 5: New trio cosmetic interactions and reachable canopy edge

**Files:** Modify `src/blueprints.js`, `src/exhibit-controls.js`, `src/scene.js`, `src/interactions.js`; create `tests/personal-trio-controls.test.js`; extend `tests/memorial-footprints.test.js`, `tests/plant-approach.test.js`, `tests/personal-source-cards.test.js`.

**Interfaces:** New interaction kinds `shutter`, `shell-glow`, `canopy`; use existing `createExhibitControl`/`stepExhibitControl` interfaces, finite timestamp-driven visual response and existing audio budget. The three art landmarks are read from sprite metadata, not guessed positions. Existing safe approach/navigation remains authoritative; no new seat pose or collision exception.

- [ ] Write failing tests: all three controls emit one local response per start; finite visuals settle and respect reduced-motion/mute. New source cards resolve their own images. For canopy 2×2, approach target lies on completed free adjacent ground outside all four occupied cells; blocked/missing edge has no unsafe fallback.
- [ ] Run `node --test tests/personal-trio-controls.test.js tests/plant-approach.test.js tests/personal-source-cards.test.js`; verify expected failures.
- [ ] Implement lens glint+quiet shutter, bounded radial pearl glow, and canopy fabric response+lantern feedback. Reuse existing normal target approach and route checks. Keep chair decorative; no seated avatar, outfit generation, collision exception or walk-through support.
- [ ] Extend footprint/save/relocation tests for all three new IDs, including nonanchor canopy cell occupancy and blocking on actor/plant/pending ground; run the preceding command plus `node --test tests/memorial-footprints.test.js tests/solid-building-paths.test.js tests/interactions.test.js` and require PASS.
- [ ] Include reviewed trio files in the final combined root-approved integration commit.

### Task 6: Integrated acceptance and local package

**Files:** Review the six-subject diffs, update `art-direction.md`/`README.md` only for implemented facts; create visual QA notes under `work/`. Preserve existing `src/ui.js`, `styles.css`, `tests/catalogue-ladder.test.js`, `tests/currency-visuals.test.js`, `tests/compact-price-ui.test.js` changes from the compact-price worker.

**Interfaces:** Consume Tasks1–5 and the existing local server/build scripts. This task produces local verification evidence, not a public release.

- [ ] Run `npm test`, `npm run check`, `npm run build`; require exit0, all tests passing and successful runtime build. Check built manifest references contain six active assets, unchanged cat/pen sources, and no old shoe/ornate-necklace source images.
- [ ] In supported local browser, inspect360×780 and390×844: owned old-save examples, source cards, default view and opened detail tray, delayed image load, all cat stages, silver chime, full Roadster hover/repeat/reduced-motion/hide-return, new-trio response and canopy accessible-edge approach without seating. Verify actual screenshot/clip evidence rather than claiming visual success from unit tests.
- [ ] Confirm pen/source hashes and the other three NPC islands unchanged; exactly three approved starter directions and no other new items or currency, no film/umbrella samples, compact prices still fit; use `git diff --check` and review explicit file diff.
- [ ] Record factual outcomes and remaining failures. Safe recoverable failures are fixed within scope and rerun; asset appearance failures return to the owning art worker, not hidden with tinting/cropping hacks.
- [ ] Hand root exact tested file paths and evidence. Stop before external publication; root owns the already-authorized batch deployment.

## Existing asset references

- Cat original: `assets/album/fluffy-cat-source-photo-v1.webp`; current hero: `assets/heroes/fluffy-cat-cottage-v1.webp`; current face atlas: `assets/animations/fluffy-cat-feeding-face-atlas-v2.webp`; fish: `assets/animations/fluffy-cat-fish-treat-v2.webp`.
- Necklace being replaced, not a style to preserve: `assets/heroes/necklace-memory-monument-v1.webp`, `assets/album/personal-necklace-source-v1.webp`.
- Shoe being replaced, useful only for +x footprint/orientation: `assets/heroes/airforce-memory-house-v1.webp`, `assets/album/personal-airforce-source-v1.webp`.
- Pen untouched: `assets/heroes/lamy-memory-column-yellow-v2.webp`, `assets/album/personal-lamy-yellow-source-v2.webp`.
- Style guide: `art-direction.md`; main manifest: `assets/art-manifest.json`; source manifest: `assets/memory-album-manifest.json`.

- Approved cat candidate: `work/sculptural-cat-v1/cat-sculptural-base-candidate-v1.png`. New trio uses the exact hero/source paths and IDs in the current spec; no additional generation is authorized beyond root-assigned asset workers.

## Integration verification, 2026-10-27

All six assets, the Santa outfit and the separate Kelly visual update are integrated. Final local verification: 652 tests passed; 53 runtime/build modules passed syntax checks; build produced 165 runtime files (68.39 MiB); `git diff --check` passed. Actual createScene diagnostics cover six personal exhibits and Kelly’s unchanged 28 supports at zoom 1, narrow entry and zoom 2.2. These are native Canvas diagnostics, not browser screenshots. Independent review also exercised 30 Kelly screen-space instrument cases at zoom 1 and 2.2. Root owns final browser acceptance, publication and commit clearance.
