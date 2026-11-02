# v7 · Continuous dance and Jiaxin reconstruction

Status: final integration verified locally. Publication is recorded by the Sites deployment receipt, not this document.

## User-directed changes

- Keep full authored dance phrases and turns. Correct rhythm sustains dance flow instead of choosing one short pose per arrow. One miss briefly softens flow; repeated misses or inactivity fade naturally to rest. Successful rhythm resumes the ongoing choreography. Score/combo logic remains separate.
- Preserve visible relaxed lobby idle, occasional greeting, manual drag-to-turn and successful costume showcase. Gameplay does not accept lobby inspection drags.
- Jiaxin remains base black long-sleeve T, white trousers and leather shoes only. Custom costumes remain a local prompt draft panel, without generation or credit debit.
- Reconstruct Jiaxin's head directly from the original portrait; the user accepted the isolated head direction. The rejected v5 coordinate-warped head must not return.
- Correct waist/leg/upper-body proportions and use a Jiaxin-only neutral rest pose. Preserve the original black T collar and stable shoulder/neck skinning; inspect front, 45-degree and rear views before promotion.
- Fix pause exactly at song end so results are not overwritten by a paused screen.

## Verification boundaries

Continuous motion has automated lifecycle, actual-rig, song-chart, grounding and transition coverage. Its visual proof is a 26-second, 15-fps offline Blender studio render driven by the production controller's real skinned vertices and materials, not a browser recording or measured runtime FPS.

Cloud-browser WebGL and physical mobile testing remain unavailable. No claim of exact photographic likeness or measured device performance is made. Original portraits, private inputs and API credentials are excluded from the published build.

The direct-photo head task cost 40 Tripo credits; account B was verified at 1,325 credits with zero frozen after completion. No additional rig or animation API jobs were submitted for this reconstruction.

## Final verification

- Full JavaScript suite: 167 passing tests, production build successful.
- Final high/low Jiaxin rigs separately passed full-flow, neutral-rest and corrected-body-reference checks; all seven shipped looks are covered.
- Neck bridge has zero strict nonadjacent interior triangle intersections, with 214 seam edges joined. Front, side, rear and dance renders were reviewed separately from these numeric checks.
- The final neck shading correction changes only normals and colors relative to the zero-crossing geometry; all position/index/skin/rig/animation data remain identical.
- High/low profiles preserve the same geometry, skin and clips. Exact hashes and independent inspection are in `qa/jiaxin-v7/` and `docs/FINAL_ASSET_AUDIT.json`.
