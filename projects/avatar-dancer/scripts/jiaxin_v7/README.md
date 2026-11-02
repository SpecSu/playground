# Jiaxin — accepted source head / native collar integration

This is an offline Blender pipeline, not a generative API client. It contains no credentials or original portrait. `ENCORE_WORKSPACE` selects a **private working parent directory**, not the web/public directory. Scripts deliberately write intermediate GLBs outside the application repository.

Inputs (private):
- `dance-stage-work/tripo/jiaxin-direct-head-v1.glb`: approved direct-photo Tripo head. Private Library backup `libfile_73c1ce7e2e48819199c7f1395a054b42`; SHA256 `151486cd5362964096e58661013d1a3629ac1500d41ea2c51928212bdd6a39c2`.
- `jiaxin-body-v6/candidate-v4.glb`: corrected native 23-bone body, SHA256 `09ee45220c065934fa1690887e7bccd72eaa08c0a1848b32534b2dca55be99ca`; private Library backup `libfile_7cf045de9ae4819197c6f593625ce27e`.

Sequence: extract native collar → prepare accepted head → integrate native neck → inspect actual front/side/rear and three clips → audit geometry/cloth/bridge → lossless-geometry texture resizing with `scripts/optimize_glb.py`.

Important invariants:
- The face, glasses, ears and crown use a uniform 0.2 scale and rigid translation only. No face flattening, stretching, or re-beautification.
- Only the authorized lower rear hair tips are cleaned locally; no new paid generation.
- The original round black-T collar and retained lower-neck geometry are preserved. New skin is a closed shared-vertex loft, not a capped cylinder or two overlapping heads.
- Use actual cyclic edge order; never polar-sort vertices. Monotonic angular correspondence plus fairing of **new intermediate rings only** removes the old self-intersections.
- Recompute adapter normals from the faired geometry, while restoring original face/garment corner normals. Adapter skin uses a robust low-frequency color field, not vertically stretched baked shadows.
- Refresh Blender UV references after adding a color attribute; CustomData allocation invalidates old references.
- Final high/low differ only in embedded image payloads. The native rig, three animations and topology are the same.

Always run Blender with `--python-exit-code 1`, and pin source hashes before auditing. Old candidates under private directories are not deliverables.
