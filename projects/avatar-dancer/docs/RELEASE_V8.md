# v8 · Wider shoulders and longer legs

2026-10-29. This bounded revision follows the user's full-body reference and request for a visibly wider, straighter shoulder line, longer legs and shorter upper body.

- Jiaxin only: distributed shoulder/sleeve widening and higher hips/waist, with corresponding skeleton and translation-track adjustments. Head, face, neck bridge, collar and shoes are protected.
- Jiaxin's lobby/rest pose now uses the actual native GLTF bind transforms via `restPose: {bind:true}`. The previous sampled shoulder rotations depressed the arm roots and exaggerated the sloping silhouette. Other characters retain their existing rest selection.
- Continuous dance, turns, miss response, stop/recovery, lobby greeting and manual rotation are unchanged.
- High/low assets preserve their original texture bytes; no new API generation or paid call was used. Actual model thumbnails were refreshed.

Verification: 168 JavaScript tests and production build pass; actual production-controller neutral, front/45-degree views and three dance poses reviewed. High/low geometry/rig/animation arrays match, protected head/neck data remain intact and strict bridge self-crossings remain zero. Details are in `docs/audit/v8/` and `FINAL_ASSET_AUDIT.json`.

Offline rendering and CPU skinning are not a claim of measured mobile/WebGL performance. The Site's owner-private audience is unchanged.
