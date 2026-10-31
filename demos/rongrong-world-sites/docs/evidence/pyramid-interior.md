# Pyramid interior optional bonus — evidence and limits

## Input inspected
- Library source: `libfile_5f4c0d6a1264819197b7c274a3091031`, original name `1ff146bf268129907a2a74789f17240f.spz`.
- Served unchanged as `/models/interiors/pyramid.spz`.
- 12,015,743 bytes; SHA-256 `e5976754bd1278f83b8d55f99524da47db9e07af6cad8b06647811b15cea611a`.
- Gzip → NGSP v3, 723,426 Gaussians, SH degree 0, 12 fractional position bits. Exact decompressed length 14,468,536 bytes.
- Parsed with the existing official Three 0.186.1 SPZLoader: position count 723,426, covariance itemSize 6, RGBA byte colors; no triangles or collision mesh.
- Native point bounds: x [-15.16553,11.84277], y [-4.51587,3.78101], z [-6.79419,4.03296]. These are not navigable bounds.

## Visual grounding
The four adjacent PNGs in `pyramid-interior/` are **CPU Gaussian rasterizations of the actual decoded positions, covariances and colors**, not browser screenshots or generated replacements. They establish the stone corridor, light, ceiling, side doorways and end pedestals, including viewpoints at x=±4. They do not verify the shipped GPU renderer or exact GPU shading.

The source is Y-down and is rotated by π about X. **Latest user instruction is third-person only.** The visible real `human-lx` player uses the existing 0.65 scale and the existing farm locomotion/sole-grounding rig; it is not a primitive or an observer marker. Player-center movement is limited to x [-3.2,3.2], z [-0.2,0.2]. The camera has separate bounds x [-4,4], z [-0.65,0.65], follows 2.2 units behind the control heading and shortens along that segment at the corridor boundary. Minimum horizontal separation is 0.45; when close, camera elevation increases from floor+1.65 to floor+2.05. The 80° vertical FOV keeps the actual character visible in portrait viewports. No free-flight/first-person camera mode is offered.

A manual piecewise floor table uses negative native median Y values at x=-4..4: [-1.807,-1.778,-1.758,-1.782,-1.813,-1.824,-1.834,-1.873,-1.931]. Actual central source samples (|z|<0.7) gave these levels; this is a hand-authored navigation aid, not inferred physical collision or a reconstructed mesh. Side rooms remain explicitly closed. CPU splat PNGs above establish only the source scene, while the DOM/Three tests inspect the actual LX skin projected by the third-person camera.


## Renderer and delivery
Uses only the already pinned Three dependency. The official [SPZLoader documentation](https://threejs.org/docs/pages/SPZLoader.html) describes its Gaussian geometry output; [GaussianSplat documentation](https://threejs.org/docs/pages/GaussianSplat.html) explicitly supports `WebGPURenderer`'s `forceWebGL` fallback, not the older `WebGLRenderer`. This separate modal uses `forceWebGL:true` for WebGL2 compatibility. Interior code and bytes load only on entry; the local production interior chunk is about 711 kB (200 kB gzip), plus the unchanged 12 MB SPZ.

**Not verified:** real browser WebGL2 shader draw, GPU/device memory, mobile frame rate or pixel-perfect UI screenshots. User prohibited CUA/Playwright/headless browser; none were used. CPU render evidence is not a substitute for these checks.

## Lifecycle and gameplay scope
- Oasis only: click the actual supplied pyramid geometry or the accessible entry button.
- Retains the exterior World and returns its player position, camera position/quaternion/zoom/target. Stops prior walking intent so return does not resume an old route.
- Existing BGM instance and audio preferences remain untouched. No new audio, account/economy/save/network-write integration. Existing home/visitor clock semantics remain unchanged.
- Third-person LX WASD translation, arrow forward/back/turn, drag follow view, and mobile hold-to-move/turn controls; explicit return works throughout loading or failure.
- Exact length/hash verified before SPZ decoding; streaming abort, renderer-init cancellation, late geometry release, context loss, retry, component cleanup and post-inert focus handoff tested.

## Verification commands
```sh
npm run typecheck
node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern dist-local --ignore-pattern .next
node --import /tmp/farm-v34-happy-dom-import.mjs --experimental-strip-types --test --test-concurrency=1 tests/minimal-pyramid-interior.test.ts tests/minimal-pyramid-interior-world.dom.mjs tests/minimal-pyramid-interior-ui.dom.mjs
node --import /tmp/farm-v34-happy-dom-import.mjs --experimental-strip-types --test --test-concurrency=1 tests/minimal-visitor-landmarks.dom.mjs tests/minimal-visitor-landmark-ui.dom.mjs tests/minimal-visitor-landmark-camera.dom.mjs
node node_modules/vite/bin/vite.js build --config local/vite.config.ts
npm run build
npm test
```
The temporary DOM resolver uses the existing installed happy-dom QA dependency; no dependency install or production manifest change. Source lint is used because the repository's stock `npm run lint` does not ignore generated `dist-local`, and therefore reports generated-bundle warnings/errors after a local build. No source lint errors remain. Full-suite terminal result is recorded in the final handoff rather than inferred from focused tests.

A real unsupported-WebGL2 init/return regression verifies no unhandled rejection: renderer initialization success is distinct from settlement; an uninitialized Three renderer is not disposed through its auto-reinitializing animation-loop path.

Final third-person checks before freeze: typecheck; source-only lint; actual SPZ+real-LX UI return test; separate bounded camera/motion tests; actual unsupported WebGL2 regression; hosted and local build. The return regression includes an exterior walk already in progress and five resumed frames: old path is canceled and the original camera follow target is anchored until the next deliberate walk/focus, avoiding a resumed follow-bias drift. Independent review checks 216 actual-LX edge/yaw/viewport cases; source-asset CPU PNGs are deliberately not labeled as third-person gameplay screenshots.
