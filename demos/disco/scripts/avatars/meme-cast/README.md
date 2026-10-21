# Banana Cat and sword-shield Cheems Frog

Two new selectable characters, independently modeled from verified meme identities in the established rounded vinyl art direction. The generator creates original geometry only. No third-party meshes, textures or private reference pictures are included.

- `banana-cat`: tall closed yellow banana peel suit, brown stem and subtle longitudinal markings. The small sad cat face stays inside the upper oval window. Tiny limbs, wet black eyes, pink nose, whiskers and compact blue tear arcs preserve the Banana Cat identity without a separate exposed cat head.
- `sword-shield-dog`: Drog / Cheems Frog, a low round body/head with essentially no neck and barely visible folded ears. Golden upper body, cream lower face/belly, squinted black eyes, prominent nose and crooked smile. Short splayed legs have separate toe tips. The character-right hand holds a broad chef knife; the character-left hand holds a pointed dark shield with bronze edging, rivets and restrained scuffs.

Public visual identity references: [Banana Cat](https://knowyourmeme.com/memes/banana-cat) and [Drog / Cheems Frog](https://knowyourmeme.com/memes/drog-wo-de-dao-dun-cheems-frog). References inform identity only; the shipping models and materials are original procedural work.

## Rig and footprint

Both use all 18 canonical bones with the unchanged +Z authoring tail convention and `speciesRig = animal-v2`. Torso/limb vertices blend across joints. The banana hood/face follows its head while its lower suit articulates over hips, spine and chest. The dog upper sphere and face articulate together; knife and shield remain rigidly hand weighted. `rig-spec.json` documents rest pivots in right/height/forward coordinates.

The runtime profiles limit short-leg crouch and damp arm excursion without disabling squash/stretch or foot planting. Actual skinned-vertex tests cover floor clearance, the 0.65 m core-body boundary, the 1 m full animated boundary (including props), high-speed turns and synchronized/group actions. The existing collision and navigation radii are unchanged.

Each model has fewer than 14,000 triangles, 18 weighted bones and two opaque material draws. Exact bytes, triangle counts and hashes live in `public/avatars/manifest.json`.

## Reproduction and review

Use Blender 4.3.2 and an isolated output directory:

    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/meme-cast/generate_memes.py -- --output-dir /tmp/meme-review
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/meme-cast/render_review.py -- --asset-dir /tmp/meme-review --output-dir /tmp/meme-review --mode front --samples 32
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/meme-cast/render_review.py -- --asset-dir /tmp/meme-review --output-dir /tmp/meme-review --mode pair --samples 96
    node --experimental-strip-types scripts/avatars/meme-cast/export_motion_review.mjs public/avatars /tmp/meme-review/actual-runtime-poses.glb
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/meme-cast/render_motion_review.py -- /tmp/meme-review
    python scripts/avatars/meme-cast/test_assets.py
    npm test

Generation refuses the shipping asset directory. It writes native `.blend` authoring scenes, GLBs, a revision manifest and rig metadata for deliberate inspection and installation. The source reuses the primitive/skin library from `animal-diversity/generate_animals.py` without executing that generator or altering existing assets. Review renders remain outside the public repository. The pose sheet bakes actual runtime skin vertices, rather than inventing a separate preview animation.
