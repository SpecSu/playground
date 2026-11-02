# V10 bounded independent acceptance — 2026-10-29

## Decision and scope
The user explicitly chose the original face for a quick usable repair. The final native Jiji assets plus fitted hats meet the bounded repair gate: the previously reported macroscopic shoulder/clothing holes and disconnected upper hair were not observed in the final reviewed side/rear samples. This is not a claim of perfect likeness, flawless appearance, watertight topology, or exhaustive collision coverage.

All experimental donor-face patches and added upper-hair volumes were rejected/private and are **not** the final assets. The broad red bonnet is retained as a conscious fast-release design tradeoff, not described as perfectly natural.

## Why V9 acceptance was insufficient
V9 removed 1,482 / 1,563 / 1,002 triangles from the shared native body/hair/clothing surfaces without restoring the underlying shell. RGB hair masks were not a reliable semantic separation. Default offline Cycles rendering also displayed backsides that production Three.js FrontSide materials cull. Earlier limited front/pose reviews missed the macroscopic defect. Prior V9 visual PASS does not establish the correctness of those assets.

## Final asset verification
- All 16 canonical GLBs pass container/accessor validation; all 8 high/low pairs have exactly equal accessor arrays.
- Final Jiji 6 GLBs match `stable-final` byte-for-byte. Exact hashes and native preservation details: `native-asset-integrity.json`.
- Against the complete early-high native sources, original primitive 0 POSITION, NORMAL, UV, JOINTS, WEIGHTS and indices remain exactly equal for all three outfits. Original nodes, skins and animation JSON remain equal. High/low comparisons cover 232 / 241 / 245 accessors.
- The other 10 LX/Jiaxin GLBs remain byte-identical to pre-V10 HEAD.
- Three canonical Jiji thumbnails match their frozen receipt hashes and are 384×512.
- `docs/FINAL_ASSET_AUDIT.json` regenerated from all 16 current canonical files.

## Actual visual evidence
`final-native-lobby-sides.jpg` and `final-native-dance-sides.jpg` summarize 12 independently generated views: three final outfits, production-controller lobby and a moving/recovery sample, yaw 75°/180°, pitch 20°. Individual 640px renders were inspected before composing the sheets. CPU-skinned production vertices were mapped into Blender; Backfacing→Transparent was forced for the diagnostic rather than relying on Cycles' backface-culling checkbox. This all-material single-sided stress test is conservative, not a pixel-identical WebGL renderer.

No macroscopic upper-hair/shoulder/background holes were seen in these final samples; hats did not cross the eyes. Remaining limitations: red bonnet is broad; a black lower skirt/waist region is visible in the white outfit's moving rear view even with increased transparent bounce depth. The native surface is unchanged; its exact shading/underside cause is not established here. Do not infer that every lower-body surface or every animation frame is flawless.

## Music / next-track checks
Independent focused JS tests: 11/11. Source-audio Python tests: 5/5, no skipped source checks. KILLLOVE decodes to 58.194014 s, starts at source zero (correlation 0.9979566), with 112 notes / 109 events / 3 doubles. POPSTARS and FANTASTIC MP3 bytes are unchanged. Latest-wins selection, stale import/start cancellation and forbidden switching during gameplay/pause/results are covered. No subjective listening claim.

## Evidence limits
No cloud WebGL/physical phone 3D rendering was available. No claim of browser GPU validation, mobile FPS or complete self-intersection freedom. Root owns aggregate tests/build and publication. This audit itself does not publish.
