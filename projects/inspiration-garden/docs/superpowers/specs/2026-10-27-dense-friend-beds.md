# Denser low planting and narrow friend-garden walkways

## Requested scope

Fill Kelly's unused grass with small ordinary plants and reduce the oversized court to usable walkways; apply the same restrained densification to the other three friend gardens. Reuse existing art, keep the established style and every existing landmark/plant in place, and avoid new mechanics, art generation or photo updates.

## Frozen composition

| Garden | Supports | Added low plants | Total plants | Clear route cells |
|---|---:|---:|---:|---:|
| Kelly | 28 | 7: 3 radishes, 4 tomatoes | 11 | 10 |
| Bear | 36 | 6: 4 bubble leaves, 2 plush blooms | 14 | 16 |
| Jiji | 36 | 4: 2 low bellflowers, 2 crimson roses | 14 | 16 |
| LX | 36 | 5: 3 silver ferns, 2 orbital blooms | 14 | 15 |

Repeated existing species form low beds and small companion planting around the unchanged musical/themed landmarks. New instance scales are 0.72–0.84; existing plant scales and all building geometry remain unchanged. Only redundant platform cells receiving new plants become land. No support is added, removed or moved. Remaining bare grass is a necessary standing or connecting node, rather than spare lawn.

The original spawn, host and every building entrance stay clear. Kelly's four musical plants, pavilion, notebook, palette, old photograph, source association and sprite definitions remain unchanged. The same preservation contract covers all existing objects, palettes, decorative edges and provenance in the other three gardens. Catalogue varieties, prices, seed grants, soft ordinary walking, Santa and all personal artwork are untouched.

The strict clear graph excludes *all* plant footprints as well as actual canonical building footprints. Every clear support is connected to spawn, and every old/new plant and building has a reachable clear exterior stance. No garden retains an empty 2×2 plaza. Exhaustive candidate search found that preserving every original target and its approach limits safe additions to six in Bear, four in Jiji and five in LX; extra planting was not forced at the cost of access.

Animal candidate positions are moved only to clear, runtime-eligible stops. Each is individually exercised through `createAnimalVisitor`; clear-but-bottleneck positions are not accepted. Visitor logic is unchanged.

## Verification and diagnostics

- Test-first failures recorded in `work/dense-friend-beds/red.log`; visitor regression has its own `visitor-red.log`.
- `tests/dense-friend-beds.test.js` protects original objects/supports, normal Kelly species, modest scales, land-only planting, strict reachability, no empty 2×2 plaza, necessary bare grass and real visitor eligibility.
- Existing spacious-court tests were updated to the new request. Unrelated art/photo/wardrobe/Santa hashes remain enforced. The superseded composition-file byte hash is replaced by explicit composition preservation and route assertions, not a rewritten baseline fixture.
- Full suite at the frozen composition: 726/726 pass. Syntax check: 55 modules. `git diff --check`: clean.
- Twelve diagnostic PNGs use the **actual `createScene` and native Canvas**, not a browser or a replacement mockup: `work/dense-friend-beds/{music,toy,anime,tech}-createScene-{overview-zoom1,mobile-entry,max-zoom}.png`. Geometry/camera receipt: `all-four-scene-diagnostic.json`.
- Normal/mobile diagnostics were visually inspected; host/player faces and torso samples also pass the existing entry visibility checks. Existing mobile framing/pan behavior is unchanged.

No commit, push or public publication was performed by this task worker.
