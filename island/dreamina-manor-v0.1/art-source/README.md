# Independent art source
These Blender sources and art-owned factories are not public web assets. Production output lives under public/assets/world; the renderer consumes lib/art.

## Rebuild
Blender4.3.2: `blender -b -t 3 --python art-source/build_botanical.py -- SPECIES --render`.
Actual-GLB stage review: `blender -b -t 3 --python art-source/render_stages.py -- SPECIES`.
SVG packets: `python art-source/build_icons.py`. SVG generation has no third-party Python dependency; optional raster inspection uses CairoSVG, or existing app sharp.
Node checks: `node art-source/check-art.mjs`, `node art-source/check-botanicals.mjs`, `node art-source/check-world.mjs`, `node art-source/check-fish-gold.mjs`, `node art-source/audit_fish.mjs`.

## Contracts
- glTF Y-up, plant root on ground; tile top localY0. World1unit=1m, cell3.2m.
- Each plant is individually authored at the height in plant-sizing.js, not normalized to avatar height. Instance finalSize/standardSize controls physical random size. Giant is already in finalSize.
- Plant Scene clip spans4s, sampled by true growth progress, not autoplay. Root scale is constant; leaves, stems, roots/fruits, and petal-opening morphs are distinct organs.
- Fish use uniform .01unit/cm for overall longest axis, preserving each original mesh's proportions. Fish heading forward+X.
- Aquarium factories return world-root position from cell coordinates; do not add a second centre offset. Bottom remains on groundtop.45, floor.59, waterheight2.1.
- Dock factory is local: localtopY0, positiveZ points out to sea. Place at exposed land edge with worldgroundY.45. Rod remains one per dock.
- Avatar action pose is additive after controller.update resets original bones each frame. Never accumulate across updates or overwrite original assets.

asset-manifest.json contains public resource hashes. Blender backup .blend1 and diagnostic PNGs are not deployable assets.
