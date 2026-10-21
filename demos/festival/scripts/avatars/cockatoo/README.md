# Original cockatoo resident DJ

Original rounded white sulphur-crested cockatoo with black sunglasses, a dark hooked beak, eight yellow crest feathers and layered compact wings. No external models or textures. This asset is dedicated to the resident DJ; the eleven participant presets and their GLBs stay unchanged.

The shipping asset is `public/avatars/dj-cockatoo.glb`; its checksum and budget are recorded in `scripts/avatars/cockatoo/asset-metadata.json`. It uses 19 upright-axis bones (the common 18 plus `crest`), normalized weights and four opaque material groups. The continuous body/neck/head mesh avoids stacked-shell seams. The crest has independent beat-driven lag; wing-tip IK scratches the existing turntables. The booth and navigation reservation do not change.

## Regeneration and review

Run from the repository root with Blender 4.3:

```
blender -b -t 4 -P scripts/avatars/cockatoo/generate_cockatoo.py
blender -b -P scripts/avatars/cockatoo/test_authoring.py
blender -b -t 4 -P scripts/avatars/cockatoo/render_cockatoo.py -- --mode hero
```

All defaults write into ignored `generated/`, never the shipping directory. `generate_cockatoo.py -- --output-dir /absolute/review` chooses another isolated location; pass that path as `test_authoring.py -- --input-dir /absolute/review`. The render script supports `--input /absolute/model.glb --output-dir /absolute/review`. Review the generated asset before replacing the shipping GLB; Blender/exporter versions can change bytes.

`npm test` covers runtime wing contacts, crest articulation, deterministic poses, reduced motion, actual skin clearance inside the existing DJ reservation, camera framing, normalized weights and triangle limits. Offline renders are model checks, not browser, audio or device-performance verification.
