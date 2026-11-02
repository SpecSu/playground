# V8 independent acceptance — 2026-10-29

**PASS for the bounded shoulder/leg-proportion and native-rest revision.** Assets are copied into the local public tree; deployment is parent-owned and not asserted here.

## Visual gate
Inspected the user's actual new reference JPEG, matched v7 baseline and v2 front/45-degree full-body renders, the production-controller native-bind comparison, and three actual dance poses from front/45. The revised shoulder shelf is visibly broader and shallower without a sharp padded bar; upper torso is shorter and legs visibly longer at unchanged total height/head scale. No obvious new shoulder spikes, neck tugging or knee collapse in inspected frames. This corrects the prior assessment: v7's sampled rest depressed the clavicles and did **not** match the requested straight-shoulder silhouette.

The production native-bind comparison distinguishes the rest-pose correction from the additional body-proportion correction. Old `neutral-proposal` captures use the historical sampled pose and are not final bind-state evidence. Only Jiaxin selects `restPose: {bind:true}`; other characters retain existing behavior.

## Exact final local assets
- High: `01bd8780a769cb683a3a8a74f5db1d5509baf7bc44a93bfe6d270f7a54200d27`
- Low: `20516614ef933bf7b7ae38ef0727dead7a92d5287af9dbae1028f38b441736ca`
- Thumbnail: `98dbd8779ba94caad64c1cf4aa370de1dffe18a9f5ccd43f26213b1e59bd1fec`

Independent rerun: 14 GLBs structurally valid; all seven high/low pairs have exactly equal decoded accessor arrays, nodes, skins and animations. Current costs/hashes are in `../../FINAL_ASSET_AUDIT.json`.

Independent v7-to-v8 primitive comparison confirms head, rear hair and neck bridge attributes/indices exactly unchanged; body positions/normals change while color, UV, skin weights/joints and indices remain exact. Bridge remains630 triangles,214 globally joined boundary edges, zero zero-area triangles and zero coincident seam-weight mismatches. Maximum weight-sum error1.23e-7. See adjacent JSON evidence. Rig rest translations/inverse binds and translation-track offsets intentionally change for the new proportions; do not claim the entire rig is byte-identical to v7.

Motion worker reports15 candidate/native-rest tests and168 shared tests passing, including continuous dance, pause, settling, planted-feet/lobby greeting. Parent reports final post-promotion168/168 tests passing; production build remains parent-owned. A misplaced thumbnail was caught during independent path/hash verification and corrected to the canonical thumbs path before doc freeze. Body worker's final proof records all242 high/low accessors equal, unchanged protected collar/shoe vertices, and zero strict bridge crossings. Independent unchanged bridge positions/indices preserve v7's strict crossing result.

## Limits
Offline Blender/CPU-controller visual and numeric evidence only: no WebGL, phone rendering/FPS or physical touch certification. Sampled poses do not prove absence of every possible cloth intersection. No exact facial likeness claim. No new head or neck-shape change, and no extra avatar looks introduced.
