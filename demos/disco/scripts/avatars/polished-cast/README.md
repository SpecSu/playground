# Rounded cast revision

This original code-authored revision updates all three reference-inspired humans and five animals. Humans have one continuous rounded head, graphic friendly eyes, a curved closed smile, soft hair masses and distinct reference outfits. Animal faces and silhouettes are species-specific. Neutral heights are frog 1.04 m, cat 1.35 m, dog 1.65 m, capybara 1.94 m and panda 2.28 m. Widths are scaled separately so tall figures do not gain a proportionally larger collision footprint.

The existing approved sculpt supplies the continuous head math and weighted tailoring. The script builds that source only up to its explicit pre-rig boundary and then replaces expression, hair and outfit geometry. It loads only explicit geometry definitions from the legacy source using Python AST; it does not invoke the legacy generator or bypass its shipping-directory guard. Do not change the sample source without reproducing both generators and reviewing the result.

No external models, textures, reference uploads or paid services are included. The 18-joint dance convention remains unchanged. Four opaque vertex-color material groups separate skin, hair, cloth and accents; animals use two or three draws. The dedicated cockatoo and three monsters are not regenerated.

Generate into an isolated directory, inspect the actual exported GLBs, then deliberately install only the reviewed revision entries. The generator refuses the shipping avatar directory.

    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/polished-cast/generate_polished.py -- --output-dir /absolute/review
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/polished-cast/render_review.py -- --asset-dir /absolute/review --mode humans
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/polished-cast/render_review.py -- --asset-dir /absolute/review --mode animals
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/polished-cast/render_review.py -- --asset-dir /absolute/review --mode portraits

`--only KIND` writes an isolated partial revision manifest; it must never replace the shipping manifest wholesale. The manifest's per-avatar generator and SHA-256 fields identify installed revision binaries. Blender/exporter versions can change bytes.

Run `npm test` and `npm run typecheck` after installation. `club-avatar-polish.test.mjs` verifies distinct dimensions, compact resting widths, exact installed revision hashes and unchanged cockatoo identity. The rig suite separately tests real animated skin, floor clearance and full radial bounds; geometry counts are not a mobile frame-rate guarantee. Offline preview images are not browser/WebGL verification.
