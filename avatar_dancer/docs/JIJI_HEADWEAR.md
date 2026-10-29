# Jiji costume-specific headwear (local revision)

Baseline: `fb449436ab8c50ae97a065a3328d7fcbb33d2637`. Final assets are the six existing `public/assets/characters/jiji-{0,1,2}{,_low}.glb` paths. This work did not publish the site, call a paid API, regenerate a face, or modify LX.

## Result

- **0 / crimson:** original frontal bonnet, white frill, clock, bows and cat decorations retained. The anomalous rear object was an oval, white lattice-textured protrusion in the donor head mesh, extending to raw X = −0.15324. It was removed and replaced with a closed, shallow, continuously curved crimson bonnet back. The visible new back reaches approximately X = −0.055, not the former separate lump.
- **1 / lime-black:** compact graphite headphones, lime piping and metallic earcup details; no old bonnet ornaments remain.
- **2 / ivory-gold:** slender champagne-gold tiara with pearls and seven faceted crystal settings; no old bonnet ornaments remain.
- Non-red scalp coverage uses the **existing red-hair image**, not generated face/texture content. The narrow former bonnet/bang-root region is closed and blended. Only original red-hair vertices at the top of the torso are repositioned to meet the smaller scalp: 1,236 lime / 1,301 ivory vertices. A source-image color mask excludes garment vertices; original hair skin weights remain unchanged.

## Preservation and mobile cost

The v3 0.88 Jiji head proportion metadata, actual core facial positions/UVs/weights and protected facial triangles remain unchanged. All original embedded images remain byte-identical for both quality tiers. Original nodes, skeleton, inverse binds and all three animation clips are unchanged. The closed neck attachment is unchanged. Red torso geometry is entirely unchanged; non-red garment vertices and all body UV/skin/animation data are unchanged. All six LX GLBs remain byte-identical to baseline.

Accessories are batched by material and compatible attribute layout, retaining the original donor-primary and neck primitive slots. Total mesh draw primitives are **5 / 10 / 9**, versus 7 / 25 / 55 before batching. `merge_headwear_primitives.py` checks a SHA-256 multiset of every triangle's material and position/normal/UV/joint/weight attributes before and after batching; no visible geometry changes are allowed.

Low variants use 1024-pixel texture limits. Their non-image data and mesh/skin/animation/node semantics match the full variants exactly.

## Stage normalization

The stage normalizes the complete bind bounds. Removing a tall bonnet must not enlarge the body or face. Use `newStageHeight = 1.9 × newRawHeight / baselineRawHeight`:

| Costume | Baseline raw height | Final raw height | Manifest height |
|---|---:|---:|---:|
| Red 0 | 1.0745639948 | 1.0745639948 | 1.9 |
| Lime 1 | 1.0634798216 | 0.9929162073 | 1.7739319124146693 |
| Ivory 2 | 1.0736800306 | 1.0221164101 | 1.808752257391983 |

Full hashes, exact bounds and LX preservation hashes: [`audit/headwear/geometry-promotion.json`](audit/headwear/geometry-promotion.json). Root owns manifest/cache integration; thumbnail rendering must use equivalent body-scale preservation.

## Evidence and checks

- [`Final front / side / back`](audit/headwear/final-headwear-front-side-back.jpg): actual **final merged** GLBs rendered in Blender Cycles, with baseline-matched cameras.
- Before/after: [red](audit/headwear/jiji-0-before-after.jpg), [lime](audit/headwear/jiji-1-before-after.jpg), [ivory](audit/headwear/jiji-2-before-after.jpg).
- Real dance/turn sheets: [red](audit/headwear/jiji-0-motion.jpg), [lime](audit/headwear/jiji-1-motion.jpg), [ivory](audit/headwear/jiji-2-motion.jpg). 22 views each: four rest orbits and three phases × side/rear × all three authored clips. These use pre-batching geometry, proven triangle-for-triangle equivalent to final.
- `geometry-evidence.json` records final source hashes, matching camera metrics, and pre-batching motion source hashes. Full and low numeric attachment reports sample 17 phases per clip.
- All six source-preservation/face/garment-mask/closed-neck checks pass. Low-tier hair classification intentionally uses the matching full-resolution baseline image, since texture downsampling can shift threshold-edge colors; source geometry/UV identity is asserted first.
- Independent QA passed all 66 motion views and actual Three.js versus Blender skinning samples (maximum error ≤0.0001063 raw units), plus exact high/low non-image equality and public promotion hash verification. See the independent review in the same evidence directory.

Current-script reproducibility was verified by rebuilding all three full assets from baseline: each rebuilt GLB is byte-for-byte identical to its promoted final file. See [`reproducibility.json`](audit/headwear/reproducibility.json).

## Reproduce (offline)

Keep a read-only baseline directory containing the original six Jiji GLBs. Example for each full asset:

```sh
python scripts/restyle_jiji_headwear.py BASELINE/jiji-0.glb BASELINE/jiji-0.glb WORK/jiji-0.glb --style crimson-clean-back
python scripts/restyle_jiji_headwear.py BASELINE/jiji-1.glb BASELINE/jiji-0.glb WORK/jiji-1.glb --style lime-cyber-headphones
python scripts/restyle_jiji_headwear.py BASELINE/jiji-2.glb BASELINE/jiji-0.glb WORK/jiji-2.glb --style ivory-gold-tiara
python scripts/merge_headwear_primitives.py WORK/jiji-0.glb FINAL/jiji-0.glb
python scripts/optimize_glb.py FINAL/jiji-0.glb FINAL/jiji-0_low.glb --diffuse-max 1024 --data-max 1024
python scripts/test_jiji_headwear.py BASELINE/jiji-0.glb FINAL/jiji-0.glb
blender -b --python scripts/inspect_neck_motion.py -- --input FINAL/jiji-0.glb --output EVIDENCE/jiji-0
```

Repeat batching/optimization/checks for indices 1 and 2. The generator explicitly rejects non-Jiji source filenames. `test_jiji_headwear.py` resolves donor/body meshes through scene nodes, not assumed mesh zero.
