# V7 independent acceptance

Accepted within offline visual, geometry and code-test scope. This is not a deployment receipt or a WebGL/phone performance certification.

## Exact final assets

- Jiaxin high SHA-256: `d16b2e358045404fc1f6a5b2d069a47937656fe5b5bd9f60e7e8d8060379c37f`.
- Low: `922bf378baa905ad3d128e4d98841e4bbea6cfb2bf72f1b70e76915b17d917e0`.
- Actual-model thumbnail: `14c077ada0c5437796e98b2c806a978a9d30e8abea0bb63f24ec23d0e4398aab`.
- Public files independently match these hashes. All 242 accessors plus nodes, skins and animations equal frozen raw `700a019ce43a78fe2059448315e8094f9b983c36b1ec15eb06a66ba7a5faeb86` exactly. High/low differ in texture delivery, not geometry/rig/animation.
- All 14 public GLBs structurally validated; all seven high/low pairs match geometry/rig/animation. Original 12 LX/Jiji neck checks pass. Current metadata/cost estimates in `docs/FINAL_ASSET_AUDIT.json`; estimates are not measured GPU memory.

## New head/neck visual and geometry gate

Compared original portrait with actual integrated front, 45-degree, rear and fullbody renders. Approved donor face direction remains recognizable, without the rejected flattened v5 shape; shoulders/body proportions and original shirt collar are coherent. Exact likeness is subjective, not certified.

Earlier candidates were **rejected** despite technical skinning passes: side fan facets, rear black band, and 15 strict nonadjacent bridge triangle crossings. Their reports must not be used for final acceptance. The frozen geometry repair `ea4c04bb7de74516fe5c01c45ab74a62d9a63487ba8bebf88022353ac193de7d` removed those crossings. The later raw700a shading repair leaves every position/index/UV/skin/rig/animation value exactly unchanged; only normals and bridge vertex colors change. Final front image was inspected again: long dark vertical neck bands materially removed. Minor hair-edge texture roughness remains; no claim of flawless close-up scanning quality.

Independent final public checks:
- 0 strict nonadjacent interior edge/triangle crossings within neck bridge. This test excludes coplanar/touch-only cases and adjacent triangles; it is not a universal intersection proof.
- All 214 bridge boundary edges join neighboring surfaces; 0 coincident seam-weight mismatches; 0 zero-area bridge triangles.
- Maximum normalized-weight sum error 1.23e-7; 23 bones and dance_01/03/05 retained.
- Inward radial area 4.53% is recorded, not treated alone as failure on a noncylindrical anatomical surface.
- Independent Three.js/Blender CPU skin sampling on geometry-equivalent ea4c: 80 points × three clips × three times, max error 0.00010204 raw units. Exact geometry/skin equivalence chain connects this to final public files; shading changes do not affect sampled positions.

## Continuous dance and retained behavior

Independent targeted flow/lifecycle/actual-rig run: 23/23. Final geometry-equivalent raw700a candidate plus existing seven rigs/configured-rest suite: 13/13. Additional hesitation-envelope checks: 8/8.

Successful judged rhythm sustains advancing whole authored clips and turns, not per-arrow poses. Changing lanes or same-time chords does not restart the phrase. A miss produces a small cooldown-limited upper-body hesitation/speed dip; repeated misses or inactivity smoothly release to rest. Recovery resumes phrase progression. First input must be a judged success; wrong-key spam cannot start motion. Short gaps sustain, long gaps rest without inventing score misses. Pause freezes timers; replay resets; scores and combos remain RhythmGame-owned.

Actual-rig coverage includes 128/170 BPM, 43-second streams through all clips, turn/boundary stop/recovery, root XZ locking, angular/head-step bounds, full skinned floor and camera frame checks. Foot grounding only lifts penetration using bounded actual-foot samples and retains authored jumps/turns. Configured neutral rest applies only to Jiaxin; invalid configuration falls back safely.

Inspected production-controller offline textured early/late contact sheets showing full choreography, turns, stop and recovery, plus matched hesitation before/after. These are offline Blender proof, not browser video or runtime FPS.

The pause-at-song-end race discovered during review was fixed: an ending round's results are no longer overwritten by paused mode. Lobby greeting/manual turntable, base-only Jiaxin, draft-only customization and no-debit guards remain. Root owns the final aggregate suite/build/package after document freeze.

## Boundaries

Cloud browser has no WebGL; physical mobile/GPU testing and subjective audio audition are not claimed. No raw reference/comparison/fixture or retired Jiaxin outfits found in public/dist at inspection; the intentionally authorized metadata-stripped photo crop remains a creation preview, distinct from full raw source input. No deployment performed by this audit.
