# Creative obstacle consistency — CPU verification

Base: published social source `144bcabae832b5cbe7ea12a5c5d9ddfacedba8f5`.
Scope: existing ground props and custom eggs; no new species, model bytes, terrain heights, UI, account permissions, or publication.

## Authority and save contract

- `creative.assets` remains the sole asset/ownership source. `staticObstacles` is an optional, regenerated projection: at most 32 unique integer `{x,z}` cells, bounded -3…6; no asset IDs or ownership payload.
- `projectCreativeObstacles` is pure. Reads, timeline advancement, and `putCanonicalFarm` share `projectCanonicalObstacles`. Stale stored projections are replaced; imports strip the field before validation while retaining the original snapshot fingerprint.
- Current body overlap and lost reachable cells reject new placement. Ordinary ground eggs count toward connectivity. Crossing an existing future route is allowed: stale routes stop at current coordinates instead of relocating actors.
- Ordinary egg placement, ordinary hatch/putdown/arrivals, UGC placement/hatch, player routes and animal routes use the same derived context. Body envelopes are conservative and based on the existing issued resource profiles, not mesh-perfect collision.
- A custom egg excludes only its own ID during same-cell hatch. Another prop/egg at that location still blocks it. Prop hatch retains the cell; creature hatch replaces it with the canonical actor.
- Pickup validates UGC ownership before advancing, settles the old obstacle layout to the command time, then removes the collider/bags the advanced actor. No old-layout time replay and no duplicated sync boundary.
- Legacy overlapping actors are not deleted or relocated. They can move outward across the exact closed boundary; each later segment rechecks the original obstacles to prevent reentry. Existing ground UGC hydration preserves its historical location.
- Existing wishing/boarding locks, reserved egg slots, 15-second custom incubation, and continuous canonical timeline are retained.

## Render and visitor boundary

- Ordinary and UGC World corrections use the same body-safe route, at existing bounded speed. Newly blocked player routes cancel without a root-position write. Guardian stale segments stop, rather than cutting through a new prop.
- Sample farms are intentionally different: `sample-scenery.ts` is a visitor-only decoration layer, **not canonical creative assets**, and no fake owners/assets were added. All 12 theme GLBs across forest/glacier/oasis remain outside owned land.
- Actual normalized/rotated GLB CPU bounds give a minimum **0.3405621178 world-unit** gap from the owned footprint. Actual VisitorSession/World perimeter walks clear the mesh bounds with avatar radius 0.3; off-farm tree destinations and unauthorized `place`/`placeEgg` commands reject. Home state/storage remains byte-identical.
- This does not claim support for arbitrary in-field sample decorations. Moving sample ornaments into owned land would require a separate authored spatial contract; current data needs no second owner store.

## Evidence

- Untouched baseline: `npm test` — **907/907**.
- New domain tests: **18/18** in `tests/minimal-creative-obstacles.test.ts`. Initial 10 cases failed before the first implementation. Later review RED cases covered the .5 boundary trap/reentry, ordinary-egg exit blockage, old-layout pickup replay, and moving UGC pickup ownership mismatch; all now pass.
- Real pine GLB ray test: old straight route intersects actual triangles; every accepted new route segment misses them.
- New actual World tests: **4/4** in `tests/minimal-world-obstacles.dom.mjs`. Sheep and UGC GLB corrections traverse around a new pine for 2,400 frames, without teleporting or exceeding existing speed limits; player stops at its current fractional position; three sample visits preserve home data.
- Full test suite: **925/925**, no skips/failures.
- Full CPU DOM suite: **65/65**, including delayed ACK/GET motion, arrival intents, custom egg/app lifecycle, dual locks, boarding refresh and visitor pause/isolation.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`: passed. Existing optional local `happy-dom` fixture dependency was resolved with a temporary Node loader; no install/API/browser was needed.
- Independent read-only review reran 18 domain + 3 initial World cases and found no remaining blocker after the five reported issues were corrected. The extra real visitor test was subsequently run in the full 65-test DOM suite.
- One boarding capacity fixture previously put a tree adjacent to the adult cow's occupied body. Its target changed from (2,1) to safe (3,0), retaining the assertion that a reserved animal slot does not block a safe prop placement.

No browser/GPU appearance acceptance is claimed. Dunes/glacier landmark retention before unlock remains deferred; the procedural ground is not described as a generated Hunyuan land mesh.
