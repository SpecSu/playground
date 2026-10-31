# Four supplied friend landmarks

Base: live v37 `9e29b32227015a1898a4285e6b549ee5143feef3`.

Mapping is fixed: oasis → golden pyramid; glacier → ice castle; forest (legacy wetland key) → Eiffel tower; lunar → rocket launchpad. No school/home landmark. Four public GLBs total 16,346,896 bytes and 200,014 triangles. Asset preparation resized only embedded 4096px textures to 1024px; geometry and material/node transforms were retained. Catalog pins both derivative and original model SHA256. No Library identity, machine path or private URL is shipped in the runtime catalog.

## Runtime / layout

`SampleScenery.suppliedLandmark` owns one `VisitorLandmarkScene`. Loading begins only when that sample scenery is constructed. Byte count and SHA are checked before parsing, external resource URIs/skins/clips are rejected, and actual static mesh triangle count/native world bounds are checked afterward. The global queue admits at most two jobs, skips disposed queued requests, aborts in-flight fetches and frees late parsed results. Repeated dispose releases each geometry/material/texture once. Failure adds no fallback mesh and cannot block ground picking; `status` and explicit `retry()` are exposed for a small optional status control.

All four models face original +Z at world x=-7,z=-6.8. Scale is min(4.8/native horizontal extent, 5.5/native height), with exact native-bound centering and grounding. Their complete geometry is on the existing [-10,10]² floor and outside owned [-4,8]². No navigation obstacle or canonical state is added. The old rear-left lunar crater moves to unused outer-left ground at (-8,4.5), clear of the launchpad and old props; the other two craters and basketball court remain unchanged.

`visitorLandmarkBounds(sampleId)` and `SampleScenery.landmarkBounds` expose exact complete world bounds **before** the fetch for main's visitor-only camera fit. Main owns the final camera/UI integration. This branch does not change World, Visitor UI, terrain, player motion, accounts, save schema or permissions.

## Fresh verification

- Tests begin RED with missing new catalog/loader. Actual four GLBs now pass byte/hash/triangle/native-world-bound/whole-floor/owned-clearance checks.
- Actual landmark bounds do not intersect any existing sample primitive or lunar court mesh. Input sample object stays byte-identical.
- Bad SHA fails closed; explicit retry loads the real model. Compressed transport length is not mistaken for decoded byte identity (separate RED→GREEN regression).
- Late bytes after disposal cannot attach; shared resource sets release once; global active load maximum is 2 and disposed queued visits never fetch.
- Actual CPU `MinimalWorld`: home loads 0 landmarks, each of four visits loads only its own model; ground ray/picking and >1.8m player movement work; input farm and browser storage remain untouched; switching away from a held landmark leaves no late scene.
- Existing two-full-crater lunar camera regression remains green. Current camera projection is diagnostic only; final main camera union must be checked at the integrated SHA.

Commands:

```sh
node --experimental-strip-types --test tests/minimal-visitor-landmarks.test.ts tests/minimal-sample-scenery.test.ts
node --import /tmp/farm-v34-happy-dom-import.mjs --import ./tests/view-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/minimal-visitor-landmarks.dom.mjs tests/minimal-four-showcase.dom.mjs
npm run typecheck
node node_modules/eslint/bin/eslint.js --no-ignore 'src/**/*.{ts,tsx}' 'server/**/*.{ts,tsx}' 'app/**/*.{ts,tsx}' 'tests/**/*.{ts,mjs}' 'scripts/**/*.mjs'
npm run build
```

Source pins are intentionally left to the combined-source owner. This is CPU geometry/DOM evidence, not browser/GPU/mobile performance or live-publication acceptance.
