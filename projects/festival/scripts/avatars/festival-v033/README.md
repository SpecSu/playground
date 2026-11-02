# Festival v0.3.3 offline avatar QA

These scripts only create offline evidence under `.local-qa/v033`. They do not edit production assets, retarget skin weights, adjust production animation, or change tests.

## Reproduce

From the project root, with the existing Node modules and `/usr/bin/blender`:

```sh
node --experimental-strip-types --import ./tests/room-loader.mjs scripts/avatars/festival-v033/export-runtime-poses.mjs
/usr/bin/blender -b -t 8 -P scripts/avatars/festival-v033/render-runtime-poses.py
/usr/bin/blender -b -t 2 -P scripts/avatars/festival-v033/scan-tool-intersections.py
# After individually reviewing every PNG and recording visual-review.json:
node scripts/avatars/festival-v033/verify-evidence.mjs
```

Use the exporter's first argument and `QA_ROOT` for an alternative evidence directory. `QA_ONLY=build-high-row-1` limits Blender to one named image. All geometry still uses the real production `createClubAvatar`, `createFestivalBuilderAvatar`, and `createFestivalCelebrationAvatar` functions.

## Coverage

- 12 uploaded characters in the approved order, each with the real map root scale of 2.
- Four exact snapshots: walking at distance/clock 0.37, heading 0.3, speed 5.4; construction at 1.0 and 1.6 seconds; celebration at 2.4 seconds.
- 48 flattened GLBs baked with `SkinnedMesh.getVertexPosition` and the actual world transform. The original rig is exercised before flattening; exported GLBs are static inspection artifacts, not replacement animated assets.
- Original embedded image bytes, UV and index data, and body materials are retained. Each original binary prefix is checked byte-for-byte and all three embedded images are SHA-256 checked after each export.
- All visible construction meshes are exported, including handle, grip, hammer head, and visible impact particles. Construction export explicitly fails if any hammer part is missing.
- All bone scales are compared against the loaded rest baseline and all root scales must remain `[2, 2, 2]`.
- 16 overviews, each with three characters at a fixed common camera/spacing; 12 animal construction closeups; cow walking/celebration closeups; cat and Jiji celebration closeups. Total: 32 images.
- Every imported mesh vertex must fall inside the camera frame. Runtime-source and input-GLB hashes are retained in render reports.

## Evidence and limitations

`runtime-pose-metrics.json` records source hashes, original and exported GLB hashes, texture hashes, vertex/triangle counts, body/tool bounds, bone-scale checks, and actual hand/hammer coordinates. `render-report-all.json` describes all cameras, inputs, and frame extents. `tool-intersections.json` gives diagnostic hammer-head surface overlap and three-direction inside-ray parity for all 24 construction snapshots.

Review every generated PNG visually before claiming visual acceptance. Static snapshot coverage does not prove every animation time or transition is collision-free. Source meshes may contain separate or imperfectly closed surfaces, so inside-ray parity is diagnostic. Blender studio lighting and recomputed deformed normals are not a pixel-identical substitute for the WebGL festival scene. No browser or scene preview is involved.
