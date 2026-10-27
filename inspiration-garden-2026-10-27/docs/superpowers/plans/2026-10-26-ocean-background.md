# Ocean B integration implementation plan

> Execute inline with superpowers:executing-plans; parent owns independent review and publication.

**Goal:** Display only the user-selected B ocean without blocking or changing gameplay.
**Architecture:** A stationary shell CSS cover image behind a transparent Canvas; restrained water accents remain. The image is a single explicit build-whitelist entry.
**Tech stack:** Existing Canvas2D, CSS and Node tests; Pillow for encoding only.
**Spec:** docs/superpowers/specs/2026-10-26-ocean-background.md

## Constraints / review focus
- Preserve1024×1536 aspect/content; encodeWebP only, <400KiB transfer /6MiB decoded. No creative raster edit.
- Image failure never blocks startup; pale sea fallback remains. No camera-linked background or seams.
- No A/C/private work/process metadata in runtime, no state/save/economy or hosting edits.

## One bounded task
- [x] Add failing tests for selected-only asset, centered/cover/no-repeat CSS, size budget, build whitelist, transparent Canvas and image-failure-independent lifecycle. Run `node --test tests/ocean-background.test.js` and focused build case; observe expected missingasset/CSS/alpha/whitelist failures.
- [x] EncodeB as `assets/backgrounds/ocean-b-cloud-emerald-v1.webp` at quality90/originalsize. Update only shell CSS, Canvas clear/alpha/faintwater and explicit `scripts/build.mjs` whitelist/minimal fixture.
- [x] Run focused scene/build tests, then `npm test`, `npm run check`, `npm run build`, `git diff --check`. Require zero failures.
- [x] Commit tested slice and send exact pin to parent/reviewer; do not deploy.

## Added seed-card polish
- [x] Add RED tests for count-based color classes and a full-content native planting button with independent sibling detail, no nested controls, zero-stock no planting, sealed artwork retained.
- [x] Implement bag-only seed-card markup/CSS. Preserve shop, known/order/acquisition and controller/state rules.
- [x] Verify delegated native button click (keyboard-style detail0) enters placement without stock/spend, sibling detail stays separate, blank/stale zero-stock actions do nothing. Full230tests/check25/build59 pass. Parent still owns native keyboard/visual QA.

## Added entrance spacing
- [x] RED: dedicated blueprint region/divider absent. Wrap existing CTA/help only; add16px margin/12px padding/subtle border, no forced height. Verify fourchoices/oneCTA and fullsuite.
