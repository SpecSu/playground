# Original club cast and articulated animation

The thirteen selectable shipped GLBs are generated locally from code-authored geometry. The three human appearances are simplified interpretations of user-supplied character illustrations; the private reference images are not included in this repository or published. No external 3D models, stock animation clips, textures, generation services, or downloaded character rigs are used.

## Shipped characters

- `human-jiji`: red twin curls, wide red-and-white bonnet, watch/strawberry charms, laced red dress, white socks and red shoes
- `human-subeike`: swept brown hair, cream open jacket, yellow glasses hanging on a white shirt, tan cuffed trousers and white sneakers
- `human-lx`: dark swept hair, black rectangular glasses, hoodie and trousers, white sneakers
- `cat`, `frog`, `dog`, `capybara`, `panda`
- `banana-cat`: closed yellow banana suit, inset sad cat face, short limbs, brown stem and turquoise crying arcs
- `sword-shield-dog`: squat Cheems Frog body, tiny folded ears, squint and crooked grin, short splayed toes, chef knife and pointed bronze-rim shield
- `monster-blob`, `monster-tower`, `monster-star`

The small frog is approximately 1.04 scene units tall; the tower is approximately 2.47. Assets are Y-up, face +Z, and have feet at Y=0. The capybara includes a separately controllable head-skinned headphone node with `extras.role = "dj"`.

## Rig and rendering contract

All models use an actual armature and normalized vertex weights. Smooth influence transitions cover the torso and limb joints. Named bones are `root`, `hips`, `spine`, `chest`, `neck`, `head`, and paired `upperArm`, `forearm`, `hand`, `thigh`, `shin`, `foot` bones with `_L`/`_R` suffixes.

Vertex colors consolidate clothing and facial colors. The three humans now share the `rounded-cast-v2` family: continuous rounded cheeks, friendly graphic eyes, closed curved smiles, softer hair and individually recognizable clothing/accessories. Each uses four opaque skin/hair/cloth/accent material groups and fewer than 28,000 triangles. The five animals now use the `species-anatomy-v3` revision: independently authored body plans and skeletal proportions, including a genuinely four-legged horizontal capybara, crouched frog, compact cat, lean hound and heavy panda. They retain the existing 14,000-triangle budget and two or three draws. See `animal-diversity/README.md` for isolated regeneration and the species rig contract. Exact triangle counts, byte sizes, generator paths and SHA-256 hashes are recorded in `public/avatars/manifest.json`.

Animal heights are 1.04 m (frog), 1.35 m (cat), 1.65 m (dog), 1.94 m (capybara, including optional headphones), and 2.28 m (panda). The height contrast does not enlarge all horizontal dimensions proportionally. Animation tests measure actual skinned radial bounds independently of geometry counts.

The earlier `approved-shape-v1` 苏贝壳 remains reproducible as a historical sculpt under `sample-subeike/`; it is no longer the shipping binary. The dedicated DJ cockatoo is deliberately unchanged by this revision, with its separate identity and 19-joint metadata under `cockatoo/`. The three monster binaries are also unchanged.

`lib/club-avatar-rig.ts` exports `createClubAvatar(kind, id, options)` and `prewarmClubAvatars(kinds?)`. Creation immediately returns a placement root and a `ready` promise. The root stays empty until its GLB is loaded; load failure rejects explicitly. The scene owns the root's position, facing and scale. The adapter owns a nested animation pivot, cloned geometry/materials and an independent skeleton.

`update(absoluteBeat, action, reducedMotion, energy)` samples all joint poses directly from the shared fractional musical beat. It never integrates a private animation clock. Dance, bounce, spin and wave articulate hips, spine, shoulders, elbows, hips and knees independently. The DJ uses two-bone arm IK for the mixing plane around local X=±0.4, Y=1.1, Z=0.4. Reduced motion produces a static quiet pose.

The two additions use `meme-cast-v1`, authored from verified Banana Cat and Drog / Cheems Frog reference direction. Their proportions are independently weighted on the same canonical 18 joints. Each stays below 14,000 triangles, 0.6 MB and two opaque material draws. Their measured rest heights are 1.726 m and 1.318 m (including the knife). See `meme-cast/README.md` for reproduction, visual-review and provenance details. All earlier GLBs, including the resident cockatoo DJ, remain byte-for-byte unchanged.

## Regeneration and offline inspection

The legacy `generate_club_avatars.py` now refuses to write when the target manifest contains a revisioned, separately approved avatar. Do not remove this guard to regenerate the shipping directory: the legacy source contains the superseded 苏贝壳 and its `--only` path would write a partial manifest. The current family is authored with `scripts/avatars/polished-cast/generate_polished.py`, which writes isolated review output only. Its README documents generation, neutral review and transparent head portraits. The older sculpt and its ten authoring tests in `scripts/avatars/sample-subeike/` remain historical reproduction tools. Regenerate into a separate review directory; inspect and compare the output before installing only the reviewed entries. The committed GLBs and recorded manifest hashes identify the current artifacts. Blender versions/exporter revisions can change bytes.

From the repository root, with Blender 4.3.2 already installed, current revision generation:

    blender -b -t 4 --python-exit-code 1 --python scripts/avatars/polished-cast/generate_polished.py -- --output-dir /absolute/review
    blender -b -t 4 --python-exit-code 1 --python scripts/avatars/polished-cast/render_review.py -- --asset-dir /absolute/review --mode humans
    python scripts/avatars/sample-subeike/test_legacy_guard.py

Generation writes only into the selected isolated review directory and refuses the shipping avatar directory. Neither generation nor rendering installs an asset or updates the shipping manifest. The model source contains no private reference PNG or external assets.

To render the currently shipped cast and its actual runtime poses, use:
    node --experimental-strip-types scripts/avatars/export_pose_preview.mjs
    blender -b -t 4 -P scripts/avatars/render_club_previews.py -- --mode cast
    blender -b -t 4 -P scripts/avatars/render_club_previews.py -- --mode jiji
    blender -b -t 4 -P scripts/avatars/render_club_previews.py -- --mode dj
    blender -b -t 4 -P scripts/avatars/render_club_previews.py -- --mode portraits
    python scripts/avatars/optimize_portraits.py

The pose exporter samples the real runtime adapter, then exports those same posed skeletons for Blender rendering. Cast and pose-review images are written outside the public repository. Portrait mode keeps only authored head-weighted geometry, frames each complete head consistently, and renders an RGBA transparent background without a floor. The optimizer preserves alpha and uses Pillow to encode only those derived selector portraits as 256-pixel WebPs in `public/avatars/portraits/`, below 30 KB each. Original-resolution rendered PNGs remain outside public.

Run the complete non-browser verification:

    npm test
    npm run typecheck

Focused tests inspect GLB decoding, normalized skin weights, named and genuinely weighted joints, smooth joint blends, triangle/material budgets, outward surface winding, finite bounds, distinct heights, DJ accessory control, deterministic posing, actual skin deformation, reduced motion, placement preservation, disposal and asynchronous loading races. Browser/WebGL appearance, device frame rate, audio playback and multiplayer behavior still require separate acceptance in the running demo.
