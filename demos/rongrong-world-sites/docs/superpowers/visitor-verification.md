# Sample friends / visits verification

Base: published P0 `d5decf5`; initial feature commit `0c99543`, isolated demo boarding `3ede5ce`. App attachment subsequently rebased onto integrator `07968b8` with `canonicalFarmLocks` from `88d2dc`.

## Automated evidence
- `npm test`: final full Node suite includes 889 tests. The only intermediate failures were the deliberate stale source-pin hashes for the authorized World/App/canonical changes; hashes now reflect the actual files.
- `node --experimental-strip-types --import ./tests/view-loader.mjs --test tests/minimal-friends.dom.mjs tests/minimal-friends-app.dom.mjs`: six actual React / actual World CPU tests, real delivered GLB bytes, CPU renderer only.
- Adjacent `tests/minimal-network-motion.dom.mjs`: unchanged P0 movement/late-ACK/expired-intent tests also ran green.
- `npm run typecheck`, explicit `eslint --no-ignore` over all new modules and MinimalApp, `git diff --check`.

## Measured isolation
- Home sheep authored geometry: 25,536 triangles; disposing visitors caused **zero** home geometry/material disposal events.
- Five visitor changes retained one active visitor canvas. Home camera delta **0**, its zoom and World instance retained.
- App test: delayed canonical command blocked entry, discarded home arrival caused **zero** pickup POSTs; late GET updated only home. Home kept **777 coins** and its one original formal animal.
- Page visibility hidden→visible did not resume hidden home RAF; home 250 ms simulation presentation was paused while visiting.
- Visitor-only unit scenario made **zero** localStorage writes. Sample commands cannot sell/exchange/collect/hatch/alter terrain, and greeting does not mint daily coins or bond.
- Demo states cover pending, active, completed, failed, canceled and expired; retries cannot double-award; foreign realm parent IDs rejected. All demo parents/results are non-transferable and no canonical farm/result/AccountClient exists in the adapter.
- Success/error from stale demo polling, disposed session reads and old visitor arrivals cannot overwrite current state.
- Touch-size contract uses existing inverse PhoneViewport scale to retain ≥44 physical CSS pixels at 320×568, 375×667, 390×844 and 430×932. Lists scroll. This is a CPU/CSS contract, not browser visual validation.
- Decorative GLB worst-case yaw bounds are outside the owned walkable footprint; paths, existing water/rest facilities and viewpoints remain connected. Five legacy animals per sample, four small perimeter GLBs, bounded procedural accents.

No browser/CUA/headless inspection, GPU visual acceptance, paid generation/API, asset promotion, publication or access changes were performed. A fresh whole-integration reviewer remains the runtime owner's gate.
