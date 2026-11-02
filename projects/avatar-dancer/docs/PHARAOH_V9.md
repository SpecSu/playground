# 埃及法老 — final wheat-tone bare-torso revision

## Authoritative final version

The user's latest request is **小麦色裸上身**. The approved final asset is **bare-v6**, frozen in private `../pharaoh-v9/bare-final/` relative to this project. The earlier blue-tunic candidate-v10 and `../pharaoh-v9/final/` are **historical only**, not the current release candidate and not evidence of final bare-torso acceptance.

The displayed name remains exactly **埃及法老**. This is a real skinned costume for the existing Jiaxin identity, not a portrait swap, a regenerated face, or a live paid generation service. Creation UI must await the real asset before granting the outfit.

### Promotion contract

- Character `jiaxin`, outfit index `1`.
- Model `/assets/characters/jiaxin-1.glb`; low texture profile `/assets/characters/jiaxin-1_low.glb`.
- Thumbnail `/assets/thumbs/jiaxin-1.webp`: **384 × 512 RGBA**, genuine transparency; crown and shoes retain margins.
- Manifest: **`height: 1.9988`, `rotationY: -Math.PI / 2`, `restPose: { bind: true }`**. The crown-inclusive framing remains unchanged from the accepted Pharaoh version; do not shrink the complete model to height 1.9.
- Exact receipt: `../pharaoh-v9/bare-final/promotion-receipt.json`.
- Root owns promotion, manifest edits and publication. The asset worker did not publish or alter the base Jiaxin outfit.

| Frozen file | Bytes | SHA-256 |
| --- | ---: | --- |
| jiaxin-1.glb | 9,648,788 | `3f9b30ee47aa1cc4e5d7e272e40d4c53e9eef182e7c84074a8013d6f4b4fcce2` |
| jiaxin-1_low.glb | 6,890,372 | `65a049e8d723a6ea6b598ebd0b996ed810e6b624d2170ab9169cb69661d584e0` |
| jiaxin-1.webp | 29,568 | `7856e7eede5c18f709d3cb1cdcaee7a45f01554026bda43ac5b04662ef5be452` |

## Real bare-torso construction, not skin-colored sleeves

The underlying accepted v8 Jiaxin identity and body proportions are retained. The face, glasses and hair geometry and image payloads are unchanged. The original **23-bone rig, skin weights, mesh topology and complete `dance_01`, `dance_03`, `dance_05` animation buffers** remain intact.

For the Pharaoh variant only, the original connected upper-clothing surface was genuinely reshaped:

1. Weld coincident UV-split positions for processing; smooth out clothing folds using Taubin fairing, then map back to the existing topology.
2. Resculpt native chest/abdomen cross-sections into a mild chest-to-waist taper, with restrained pectoral contours, central abdominal line and navel indentation. No exaggerated bodybuilding anatomy or separate muscle shell is used.
3. Conform native upper-arm/forearm sections around the actual shoulder/elbow/wrist axes; remove sleeve volume, shoulder-seam ridges and cuff edges.
4. Remove the old collar ridge across both sides of the existing closed neck bridge. The lower bridge is reshaped and tone-blended; the upper neck-to-face boundary remains unchanged. This supersedes the old blue-version claim that every neck vertex is unchanged.
5. Clear fabric detail from the bare region's **diffuse, normal and ORM maps**. Apply a restrained wheat-tone skin palette, subtle anatomical variation, and wrist transition. No old cloth normal map is left under a flat skin-color tint.
6. Preserve the distal native palms/fingers; the proximal wrist is reshaped for a continuous bare-arm transition. The hands are naturally somewhat lighter, separated visually by the gold cuffs. The base `jiaxin-0` asset is never modified.

Measured final changes: **12,155 body vertices** move by more than 1e-7 raw units; maximum displacement ~0.04090 raw units. There is **no new body shell**, no added torso topology and no detached fake animated body part. Original duplicate-UV seams and the body/neck-bridge shared boundary have measured positional split **0**.

Gold/blue Nemes headwear, cobra emblem, layered collar, geometric pectoral, substantial cuffs, gold sash/buckle, short separated hip panels and gold/blue shin textile remain. Earlier rigid torso/greave/shoe overlays and long wrapping skirts were rejected after dynamic review; the approved version uses the original lower-body surface and short independently skinned decorative panels.

## Performance budget

- **68,723 triangles** total; base Jiaxin has 63,067, so the Pharaoh accessories add **5,656** (~9%). Bare-torso reshaping adds **zero** triangles over the approved dressed Pharaoh.
- **Seven material primitives**: original four plus three batched accessory materials. Approximately three additional model draw calls in a normal single render pass; shadows and other passes can add more.
- No new texture slots. Existing body diffuse/normal/ORM payloads are replaced; head/hair textures remain intact.
- High/low use identical geometry and rig correctness. **Low is a texture profile, not geometry LOD.**
- GPU FPS was not measured. Geometry counts, file sizes and CPU runtime behavior are verified; a rendered browser smoothness pass is not claimed.

## Final verification

Private scripts and evidence are under `../pharaoh-v9/`:

- Build sources: `build_pharaoh.py` for accessories; `bare_pharaoh.py` for native-body reshaping and skin maps.
- `check_bare_asset.py`: final high/low pass. Checks original nodes/skins/animation JSON and animation buffers, unchanged protected head/hair geometry and image payloads, unchanged topology/weights, protected distal hands and upper neck boundary, finite unit normals, no new degenerate triangles, and coincident UV/body-bridge seams. Results: `bare-final/validation-high.json`, `validation-low.json`.
- `bare-runtime-controller.test.mjs`: **2/2 high/low pass on final bare-v6 bytes**. Exercises 128 and 170 BPM, all whole phrases and turns, no-input stillness, hit-driven flow, miss settling, pause/resume, results/retry, interruption/recovery, root anchoring, actual skinned floor clearance and portrait projection. Log: `bare-final/runtime-controller.log`.
  - Max per-frame bone rotation ~0.125 rad (< 8° at 60 Hz).
  - Max sampled head displacement ~0.02756 world units per 60 Hz step.
  - Minimum sampled floor +0.00218 world units after existing grounding.
  - Sampled portrait extrema: crown/head top **10.78%**, feet bottom **61.06%**.
- Three.js ↔ Blender skin test on exact bare-v6 high hash: **PASS**, three clips / nine phase samples. `bare-final/runtime-skin.json`, `skin-cross-engine.json`. This is CPU cross-engine skinning, not a browser screenshot.
- Independent visual review: front/45°/back, nine selected full-size poses, and **54 dense samples** (18 per clip). The bare-v5 geometry passed; final bare-v6 removes only remaining wrist-map dark pixels. `bare-final/geometry-equivalence.json` proves all geometry, skin, animation and vertex-color bytes are identical between these versions.
- Dense evidence: `bare-v5/dense/contact-{01,03,05}.png`. Final full-size views: `bare-v6/review/`. Internal anatomy inspection temporarily hides accessories in the render scene only: `bare-v6/anatomy/`; it is not a different runtime model.
- Both root and the independent reviewer approved the final bare-v6 front/45° appearance. Sampled inspection does **not** prove every animation frame is entirely free of microscopic intersections.

## Correct presentation artifacts

- `bare-final/jiaxin-1-transparent.png`: true transparent 768 × 1024 offline render used for the final WebP.
- `bare-final/ENCORE-埃及法老-实模展示.png`: 1400 × 1080 **bare-torso** front/dance comparison from the final actual GLB, explicitly labeled **实际 GLB 模型离线渲染 · 非游戏截图**.
- Updated Library item: `libfile_17c2b6c623988191a0a57a8e2ddc3f6a`, **version 1**, current file `file_000000004b3c8230b77a68b777f090b3`. Version 0 / old file `file_00000000694881f594593e26974cf650` shows the superseded blue tunic and must not be used as the final delivery image.

No paid API, face regeneration, source-photo upload, user-computer operation, commit or publication was performed by the asset worker.
