# Acceptance checklist

This file records the original delivery checks. Subsequent release-specific verification is documented in `RELEASE_V5.md`; historical counts and track details below are not the current manifest.

## Verified
- [x] UI: start song, pause, resume, full song reaches results; own player appears in mock ranking.
- [x] Scoring: real input, perfect/good/miss windows, no double score, touch synthesized-click dedup, key-repeat ignored, pause and replay edge cases (16 tests).
- [x] Original track: 77s stereo MP3,128BPM, -13.97LUFS,-1.62dBTP; production source and provenance preserved.
- [x] Root motion: actual GLB all18 outfit clips sampled121frames each, horizontal drift corrected without changing vertical motion.
- [x] First two models: actual Blender fullbody/head/three dance poses rendered. LX coat weighting defect repaired; fingers/hand vertices protected.
- [x] Asset optimization: final derived-head geometry and animation preserved byte-for-byte between quality variants; high2K/low1K maps; originals outsidepublic retained.
- [x] Desktop9:16 shell inspected in supported cloud browser.

## Pending before delivery
- [x] Four additional outfits: actual rig poses and weights inspected; sizes measured. First faces FAILED user review; all6 now use their respective direct-source canonical 3D heads, fresh front/45/back/pose gates passed. Final likeness remains user acceptance.
- [x] Actual model thumbnails and all six default/low model manifest entries present.
- [x] Final results layout inspected at desktop portrait: both replay and change-outfit actions visible. Character/outfit/close-up UI state changes verified.
- [x] Audio import race, pre-init mute, short-track validation, startup selection race, stale model progress, and cloned skeleton teardown independently reviewed and covered by tests.
- [x] Final local regression: 48/48 JS plus4/4 Python passing, production build successful at 2026-10-28 19:04 UTC.
- [ ] Optional live local-file chooser QA remains untested: browser upload approval was not granted; no retry or bypass.
- [x] Final build and public/dist text secret/reference scan completed; private photos absent from public/dist.
- [ ] Source handoff and PRIVATE publication owned by parent; no public release authorized for this project.

## Explicit limitation
Supported cloud browser WebGL cannot initialize. Actual browser GPU frame rate, GPU draw calls and mobile hardware smoothness are unverified. Offline render/model transforms and resource estimates do not substitute for hardware measurement. User's local computer must not be used.

## Face rescue evidence
- [x] Six real head/costume pairs and12 variants;23bones,3clips each, no external image references.
- [x] Each person has one canonical head across3outfits; high/low geometry+animation bytes identical.
- [x] Jiji bonnet/redhair and LX glasses retained from direct-photo reconstruction.
- [x] Full6costume actual-mesh contact sheet, both head portraits and actual-stage offline composition generated.
- [ ] User confirms likeness; not claimed as scanned or photo-exact.
