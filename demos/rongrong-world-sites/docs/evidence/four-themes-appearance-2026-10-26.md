# Four sample themes and first terrain-appearance DIY increment

Published base: `adc12752a025ea0bb3a90113ff9cb6d25ce2a6bd` (v30).
Verified business source: `17b13feeddf9e1120f4d1bfd5d10d23abb7b3380`.
This evidence and source-provenance refresh follow that exact independently reviewed source. They do not claim publication or a self-referential commit identity.

## Delivered scope and honest boundaries

- Four clearly authored sample farms: desert (`oasis`), glacier (`glacier`), wetland (retained legacy key `forest`) and lunar (`lunar`). These keys are not user IDs. Real friend names and avatar sources are still pending; placeholders are not fabricated contacts.
- The lunar stage has six clearly pending character slots, not six loaded GLBs. They do not enter animal, egg, asset or economy state. Character reference images are not friend avatars or runtime models. The seven existing playable species are unchanged; the paused twenty-species branch is absent.
- Free `paintTerrain` edits the optional finite `Tile.appearance` only on owned dry land outside the shop. Natural removes the choice; lunar/slate/rose are cosmetic. Terrain, natural terrain, exploration, egg habitat, supply and water physics retain their existing rules. Converting to pond/creek clears the appearance; converting back to dry land starts native again.
- The surface picker works from terrain editing and the CreativeStudio entry. This is an initial appearance-DIY increment, not complete arbitrary terrain editing, generated land, or a user-approved permanent limit on future DIY.
- Sample visits retain their separate, non-persistent capability boundary. Visitor-only overview zoom does not change the home camera, and sample commands cannot paint the home or transfer pending slots into its economy.

## Reproduced review fixes

- Extra decorations originally cleared owned land but could exceed the complete existing ground footprint. Independent actual-mesh checking found 11 old overflows. The corrected 16 GLBs and 100 primitive decorations fit the original ground footprint without adding terrain or changing navigation. Minimum owned clearance is **0.3974122655 world units** for GLBs and **0.3980518818** for primitives, above the unchanged 0.3 requirement. Two complete lunar craters remain in the initial CPU camera projection after relocation.
- The terrain picker import had displaced the client directive. The directive is again the first statement, protected by an AST regression test. Explicit source lint, rather than a command that ignores source directories, is the verification basis below.

## Fresh final verification

- Ordinary full suite: **944/944**, no skips.
- All actual React/World CPU DOM suites: **94/94**, no skips. Previous slow-ACK/arrival, visibility, canonical lock, custom egg, boarding and obstacle regressions remain green.
- Typecheck, explicit full source ESLint, production build and whitespace check: exit 0.
- Protected Sites/source-pin suite after provenance refresh: **8/8**.
- One independent reviewer ran **58 focused ordinary checks, 12 fix/P0 DOM checks and 14 new adversarial/data/actual-World cases** on the reviewed revision. Cases include malformed paint, invalid/future saves without writes, real API identity/origin rejection, a lost lunar ACK followed by a newer rose revision without rollback, visitor rejection, both renderer modes/cache cleanup and late actual GLB completion after sample disposal.
- The combined lunar renderer test first failed on the metadata-only precursor, then passed on this final source: **33 legal lunar tiles change actual albedo**, geometry-position and normal-map bytes stay identical, and more than 900 water-field samples stay unchanged. Shop/water/unowned tiles have no lunar choice; visitor ticks retain its appearance but reject painting.
- Repeated sample switches retain one visitor canvas, do not dispose home model resources, and leave home camera/storage unchanged. Additional procedural decoration is bounded at 1,344 triangles per theme or fewer.

No new model bytes, schema/migrations, authentication or dependency inputs changed. The temporary DOM loader is test tooling, not an application dependency. CPU geometry, projection, textures and event checks are not browser/mobile GPU visual acceptance. No hosted HTTP or headless/CUA verification is claimed; existing build chunk/static-route warnings remain non-fatal.
