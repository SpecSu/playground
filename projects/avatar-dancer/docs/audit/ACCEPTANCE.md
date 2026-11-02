# Historical v2 ENCORE acceptance evidence

Current v3 proportion/audio/camera revision: see `proportions/INDEPENDENT_ACCEPTANCE.md`. The hashes and counts below describe the prior v2 snapshot, not current assets.

## Status: PASS for scoped offline/code acceptance; real-WebGL rendering unverified

Real-WebGL browser rendering is unavailable on the cloud QA surface. Offline Blender renders and CPU Three.js skin calculations are explicitly **not** a rendered browser pass.

## Required acceptance
- Six outfits: inspect head/neck from front, side and rear, rest and representative real dance poses. Closed triangle topology is necessary but insufficient: visible skin seams, folds, gaps and overlap matter.
- Preserve actual facial features and face textures; narrow anatomical neck-rim repair is allowed. High/low variants must match geometry, joints, inverse binds and animation.
- Six full-body thumbnails must depict the final GLBs and reveal outfit silhouette, hems and footwear; no UI crop hiding these differences.
- Costume A→B→A should reuse parsed resources. Six-outfit cycles should avoid repeat downloads within a bounded byte cache. Verify stale requests/progress, failures, parser concurrency and disposal.
- Arrows and judgement effects readable without obscuring performer. Progress stays at top edge. Loading settles on success/error, including unavailable WebGL; closeup loader must not cover face.
- Run final tests/build after assets are promoted. Rendering/performance evidence must state environment and limitations.

## Runtime rig cross-check

`audit_runtime_skin.mjs` reads a GLB through the real Three.js GLTFLoader and evaluates skinned vertices at 13%,47%,81% of every clip. Materials are omitted only because Node has no image decoding; geometry, hierarchy, skins and animations remain original. Twenty indexed (actually referenced) vertex samples per skinned primitive cover donor head, neck repair and body.

`audit_runtime_skin_blender.py` imports the same SHA-256-verified asset in Blender, matches rest points, applies corresponding action/times, and compares evaluated vertices after coordinate conversion. Thresholds: rest correspondence <0.0001 raw unit; posed error <0.0005 raw unit. This catches a large engine matrix/rig mismatch; it does **not** certify neck surface aesthetics or every vertex/frame.

```sh
node scripts/audit_runtime_skin.mjs INPUT.glb /tmp/three-skin.json
blender -b --factory-startup --python-exit-code 1 --python scripts/audit_runtime_skin_blender.py -- /tmp/three-skin.json /tmp/skin-comparison.json
```

`runtime-skin-lx-0-candidate.json` is an **intermediate snapshot**, not final assets: 80 points ×9 posed samples, maximum head error0.0000682, whole model0.000106. No macroscopic Three-vs-Blender discrepancy. The candidate nevertheless failed independent rear-neck visual inspection (striped bridge in first revision; jagged black seam in next), and was returned for repair.

## V2 candidate evidence (not yet final)

All six high-resolution candidates passed runtime skin comparison: maximum rest correspondence error6.31e-7, maximum posed error0.000107 raw unit. Reports: `v2-runtime/*.json`, each with asset SHA-256 and sampled actual source-node names. The sampler uses referenced triangle indices; unreferenced original accessor entries retained after clipping are not rendered and must not be matched against Blender (which discards them).

Independent lx-0 v2 rear150° rest render resolves the earlier black U seam and hollow rear-neck appearance. LX partial action contact sheet reviewed: no obvious separation or elongation in shown poses. Original serrated white garment neckline remains a close-up cosmetic detail, distinct from head detachment. Those checks were pending at this historical checkpoint; see final verdict below.

## Frozen final-candidate numeric checks

- `final-runtime/*.json`: all six pass across3clips×3phases (420 vertex correspondences,3780 posed comparisons). Named skin influences also match, disambiguating coincident vertices. Source SHA-256 pins the exact candidate.
- `final-candidate-images.json`: every embedded image in all12 high/low GLBs matches the original v1 byte hash. This verifies face/outfit texture preservation, not perceptual facial geometry by itself.
- `final-hi-low-sync.json`: each of6 pairs has exact non-image buffer bytes and exact mesh/skin/animation/node JSON. Low variants change texture resolution only.
- Compressed wardrobe totals:83.01MiB high,42.86MiB low, within128/64MiB byte-cache caps. These are file bytes, not browser/GPU memory measurements.
- LX1/2 complete22-view contact sheets independently reviewed (4rest angles +3clips×3phases×2angles), including dance05. No obvious head separation or pathological neck stretching.
- Those checks were pending at this historical checkpoint; see final verdict below.

## Final independent verdict

**PASS for the reported defects within verified scope.** No remaining blocking code/asset issue found. This is not publication approval or a real-device GPU certification.

- All12 public GLBs match the audited final-candidate hashes (`promoted-hashes.json`). All6 high/low geometry/rig pairs and embedded-image preservation checks pass.
- Independently reviewed all6 ×22-view actual-GLB contact sheets (132 rest/turn/dance views), including all shown dance05 samples. Reported head detachment and hollow rear neck no longer visible; no pathological neck stretching in sampled poses.
- Final6 CPU cross-engine comparisons pass (420 point correspondences,3780 posed comparisons), maximum error0.000107 raw unit. All12 topological neck checks pass.
- Six384×512 full-body thumbnails independently inspected: hats/heads, hems and footwear remain visible, silhouettes/colors are clearly different. Source SHA-256, dimensions and output byte counts verified against promoted assets (`thumbnail-provenance.json`).
- Stable release query revision preserves intra-release cache reuse while invalidating old model/thumbnail URLs. Final Node suite61/61 passes; build passes with only existing>500KB bundle-size warning. Parsed/byte cache tests cover A→B→A reuse, stale requests, bounded idle residency, serial decoding, failure and disposal. File-byte caps cover83.01MiB high/42.86MiB low wardrobe.
- Root independently reports browser DOM/fixture checks of arrows/judgement visuals, top-edge progress, all6 selection cards, closeup loader placement and loading success/error dismissal. The actual unavailable-WebGL path hides loading and disables misleading Start. These are UI checks, not rendered dancer/browser validation.

**Limitations / nonblocking residuals:** real-WebGL final rendering, mobile frame rate and GPU memory remain unverified because the cloud QA browser cannot create WebGL. Original serrated garment neckline and occasional hair/shoulder intersections persist in closeups; neither is the reported detached-head defect. Sampling does not prove every possible animation frame is intersection-free. Root owns final clean packaging and any separately authorized publication.
