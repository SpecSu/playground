# Kelly Wonderland music court

Root approved this user-selected extension on 2026-10-27. It is visual-only except for aligning existing instrument targets with measured replacement artwork.

## Fixed contract

- Keep Kelly's existing 28 support cells, their IDs, positions, land/platform types, elevations, spawn, plants, building, footprints, authorship, botanical families, seed propagation, prices and music mechanics.
- Replace only five existing art keys: `portrait_rehearsal_pavilion` (214 CSS px, 2×2), `giant_piano_sunflower` (224 CSS px, existing scene scale 0.92, 2×2), `drum_pumpkin` (102 CSS px), `keyboard_corn` (100 CSS px), and `gramophone_flower` (102 CSS px).
- Style: refined Alice in Wonderland musical court; ivory, crimson, brass, sage, playing cards and theatrical foliage. Use only root-approved worker assets, not additional variants.
- Kelly island alone receives a procedural cream/charcoal chess floor: even `(x+y)` uses `#EEE9DE`, odd uses `#29262B`. Preserve support types and path rules; suppress grass flecks and timber grain on this visual override. Other islands and the player's palette settings remain untouched.
- Preserve three pavilion rehearsal sounds, five keyboard notes, two drum sounds and manual gramophone chord. Normalized frame-relative authored landmarks control hit zones and glow positions; no autoplay or new music rules.
- Kelly source photograph remains `kelly-friend-photo`; keep glasses/hair/scarf lineage. Update only descriptive story where necessary.
- Replace only Kelly's offline selfie. The other three photo entries and PNG bytes remain identical. Fixed selfie protagonist remains original-outfit 苏贝壳.
- No new land-edit UI, plant counts, buildings, rewards, economy or save migration.

## Verification

TDD covers parity/island isolation, instrument landmarks and safe fallback, exact support/identity preservation, other-island/photo invariants and build whitelist. Run the full suite, syntax check, static build and diff check. Render the actual 28-cell Kelly world using `createScene` and native Canvas at normal/mobile/max zoom; label these diagnostics, not browser screenshots. Root owns ordinary-browser acceptance and the already authorized public deployment after review.
