# Historical 苏贝壳 reference sculpt

This original code-authored sculpt is the source for the user-approved replacement on 2026-10-12. The private reference image is not embedded or redistributed. There are no external models, textures, animation files or paid-service dependencies.

This earlier sculpt has been superseded in the shipping cast by `rounded-cast-v2`. Its historical approved artifact had SHA-256 `94833846643e35e53fb8326a6767d3d43bd724c1820e65ff2582701f14cc4d89`. It has 34,364 triangles, four opaque material groups, 1,213,804 bytes and the existing 18-joint rig. The single continuous head, surface-conforming smile and graphic eyes, asymmetric hair masses and material finishes are intentional; a later optimization should preserve their visible shapes.

Run from the repository root using Blender 4.3.2:

```sh
blender -b -t 4 --python-exit-code 1 --python scripts/avatars/sample-subeike/generate_sample.py
blender -b -t 4 --python-exit-code 1 --python scripts/avatars/sample-subeike/test_sample.py
python scripts/avatars/sample-subeike/test_legacy_guard.py
```

Both Blender commands support `-- --output-dir /absolute/review/directory`. The default `generated/` output is ignored by git. Generation writes an editable `subeike-sample.blend`, the consolidated `human-subeike-sample.glb` and `sample-metrics.json`; it never copies over a shipping asset or changes the manifest. Exporter versions may alter binary bytes; do not automatically install regenerated output. The current shipping artifact and its hash are recorded in `public/avatars/manifest.json`; do not install this historical output over the current revision.

The ten Blender tests cover head topology, visible smile placement, graphic-feature offsets, concave stroke triangulation, hair cap and roots, rear hair/jacket clearance, surface hierarchy, normalized skin and shoe seams. These structural checks complement pixel inspection; they do not certify visual appeal, browser rendering or mobile performance.

For current installed asset identity and runtime compatibility, run `npm test`. The dedicated `tests/club-avatar-subeike.test.mjs` now pins the rounded revision, verifies its manifest and checks deformation/reset behavior. The shared rig suite additionally checks all-model skin bounds, floor clearance, locomotion, high-energy actions and reduced motion.

The standalone guard regression test runs the legacy generator in a temporary fake checkout and verifies that a revisioned manifest and its asset sentinel remain untouched. It never points the test at real shipping assets.
