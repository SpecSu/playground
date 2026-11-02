# v11 motion and framing

- Existing 23-joint rigs only; zero GLB edits. No finger or facial morphs exist, so the finale suggests a comic nose-side hand/whole-palm gesture, not articulated nose picking or a newly animated smile.
- Independent four-second result sequence: settle, 120° turn, return to35° with distributed upper-spine/neck/head look-back, raise/lower hand once, hold. Popcorn callback once at1.05s with monotonically increasing runId. No particle replay on hidden/resume; leaving results invalidates the timeline. A new round immediately resets result pose to ready, while pause preserves its existing gameplay behavior.
- Single WebGL renderer/canvas moves into the UI result slot. Alpha is enabled when creating the context. Stage geometry/dust hide, original background/fog/visibility/host sizing restore; character lights/environment remain. Zero-size portrait hosts are not resized to a fake fallback size.
- Playing default distance8→5.333m, targetheight.42→.65m gives approximately150% projected scale. Lobby full-body wardrobe framing is unchanged. Actual judgment line remains~81% screenheight; old62% foot cutoff was deliberately replaced, not accidentally relaxed. Source-clip head silhouettes remain in frame across all8looks. Extreme raised hands may crop slightly in the static default, with runtime upper-body safety easing the camera back.
- Sustained dance gets a smooth8-beat close-up window in each32-beat cycle, max10%push, plus two-beat1.5%breathing. No per-note camera cuts. Disengagement returns to default; paused camera freezes. Reduced motion retains static150%gameplay and a static large portrait, with no turn/gesture/burst.
- Face-first portrait deliberately permits large hat rims/shoulders outside the slot; it does not shrink the face to fit a giant headdress. Native head joint anchors framing per asset.

## Verification and limits

`node --test tests/aftershow*.test.mjs tests/stage-camera*.test.mjs tests/input-motion-manifest.test.mjs`

All16high/low GLBs exercise actual skinned points, all8looks have textured offline keyframe evidence. Hand/head sampled surface gap and angular continuity are measured through the timeline. The sampled vertex clearance is **not** a complete triangle collision proof; textured views supplement it. A bounded extra forward gap avoids the widest headdress. No claim of browser GPU performance or facial expression generation.

Reproduce offline evidence (requires Blender):

```
node scripts/capture_aftershow_proof.mjs public/assets/characters/jiji-0.glb /tmp/encore-aftershow
blender -b -t 4 -P scripts/render_aftershow_proof.py -- /tmp/encore-aftershow
node scripts/capture_camera_proof.mjs public/assets/characters/jiji-0.glb /tmp/encore-camera
blender -b -t 4 -P scripts/render_aftershow_proof.py -- /tmp/encore-camera
```

These are production-controller CPU-skinned vertices rendered offline with original materials, not captured browser footage. They do not modify source assets.
