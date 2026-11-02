> **交接阅读提示：** 本文件保留阶段性工程记录，部分数值、素材描述已被后续版本替代。最终 v36 状态以 `HANDOFF.md`、当前代码与 manifests 为准；历史参考目录不参与运行。

# Inspiration Garden — art direction and authored scenes

## Current direction
**Reference-driven illustrated style, ready for integrated review.** The user supplied three actual references and delegated the final choice. The chosen coherent synthesis is reference 3’s clear illustrated miniature spatial design + reference 1’s warm handdrawn storytelling + reference 2’s cozy layered staging. It is deliberately **not pixel art, not glossy/clay 3D, not a pixel/nonpixel mix**.

Final visible vocabulary: fine warm charcoal-brown contours, organic confident drawing, clear fresh sage/lime greens, warm cream/coral/ochre/aqua/lilac, selective interior botanical lines, and restrained cel-shaded depth. Twenty reference-driven plant sprites, four construction sprites and eight tiny scenery accents are ready. Earlier waxy and painterly atlases are archived style explorations, not runtime defaults.

The final camera decision is a fixed 2.5D oblique/isometric view with pan/zoom, not freely rotating 3D. Original v37 character identity and UI habits remain. Root owns rendering actual existing GLBs into transparent character sprites; warm outlines and low specular harmonize them without inventing replacement characters. Recommended Freestyle contour at 384×512: 3.2 px warm #485044, silhouette + major creases only.

### Shared palette / line recipe
- Water #afd9d8, quiet secondary ripple #c7e7df; small cream glints, no busy high-frequency waves.
- Grass top #b6d77e, lit grass #c9df96, edge green #799958.
- Earth side #b99066 / #997253, wood #d5b07a / #a47850.
- Ink #4c5647, warm cream #fdf9eb, coral #ed947d, lavender #b8a0ce.
- World contour around 1.2–1.5 CSS px at default zoom, finer interior lines. Flat shadow shapes, soft restrained contact shadows; no hard black AO or heavy glossy gradients.

## Continuity from v37
- Reference source is read-only `../manor-reference-v37`.
- Existing cast uses softly molded, low-contrast dimensional toy forms. The final illustrated plants adapt this dimensional readability with stronger warm contours and clearer shading.
- Retain cream surface `#fdf9eb`, ink `#1a1a1a`, small top identity pill, circular utility buttons, slim lower capsule dock, and one shallow bottom sheet. Colorful content lives in the world, not a dashboard.
- The rejected direction is flat emoji/clipart, randomly placed crops, generic new avatars, or UI covering the garden.

## Manifest contract
`assets/art-manifest.json` has `sprites[key]` with `image` relative to project root, `frame:{x,y,w,h}` in source pixels, `anchor:[x,y]` normalized inside that frame, and suggested `width` in CSS pixels for the default scene scale. Source atlases are unmodified generated RGBA PNGs; use source rectangles rather than creating 20 duplicate images.
- Project images: `assets/atlases/basic-plants-illustrated-v3.png`, `creative-plants-illustrated-v2.png`, `botanical-wonders-illustrated-v2.png`, plus `construction-illustrated-v1.png` and `scenery-illustrated-v1.png`.
- Older files without `illustrated` in their names are style explorations, NOT runtime recommendations.
- Anchors are measured from the alpha footprint, not blindly set to the image bottom. Root contact is the ground position; depth sorting uses that position.
- All sprites require a soft low-opacity contact ellipse in the renderer, not opaque rectangular shadows. Do not tint their bitmap to fake theme changes.
- Runtime suggested max: 3 plant atlases decoded once (~19 MB RGBA), two construction/scenery atlases lazy-loaded (~13 MB extra), avatar assets on demand. Default plant art 78–104 CSS px wide, 40–56 px in catalogue cells. No per-instance data URL extraction.

## Plants and readable interactions
Single-plant local interactions only: no automatic ensemble, no microphone/chat/API claim. Interactions should have 0.1–0.2s tactile response, a 0.8–2.2s playful beat, then settle; each may run muted.
- `whisper_radish` / 悄悄萝卜: leaf ears lean inward; a tiny rounded speech-puff emerges, no dialogue claim. Breath-like filtered noise + two soft syllabic tones. Caption: “凑近一点，叶子里藏着小秘密。”
- `puffer_tomato` / 鼓鼓番茄: inflate width 1.16, height 1.10; release with elastic wobble and a soft pop. Caption: “戳一下，鼓起一口小脾气。”
- `drum_pumpkin` / 咚咚南瓜: compress body 0.94 for 70 ms, alternate slight left/right roll, one visible beat ring over membrane. Warm short low drum tone. Caption: “把今天的好心情敲成一声咚。”
- `singing_eggplant` / 铃铃茄子: swing from stalk anchor ±6 degrees; 3 descending soft bell notes, discrete lavender sparkle. Caption: “摇一摇，开出三声清脆的小铃。”
- `keyboard_corn` / 琴键玉米: short side-to-side rocking, three small buttery key flashes across front; soft 3-note arpeggio. Caption: “一排玉米粒，藏着一小段旋律。”
- `wave_cabbage` / 海浪卷心菜: slow 2-cycle horizontal sway, two small foam curls travel outward and disappear; filtered ocean breath. Caption: “轻轻一碰，叶子卷起一朵小浪。”
- `sleepy_sunflower` / 瞌睡向日葵: dip 7 degrees then recover slowly, one little cream sleep bubble; low soft yawn glissando. Caption: “不催它，等一个慢慢的哈欠。”
- `glow_mushroom` / 月灯蘑菇: cap/gill glow breathes twice using local additive pale aqua mask or restrained halo; two warm firefly points. Gentle glass tone. Caption: “点亮一盏只属于花园的小夜灯。”
- `painter_tomato` / 画画番茄: tilt toward brush, a brief turquoise/lilac/coral 3-dot painted trail above its own soil cell; no permanent graffiti. Caption: “蘸一点好天气，画一朵没见过的花。”
- `cloud_lantern` / 云朵灯笼: lantern sways, contained warm golden seed glow brightens and dims; tiny hanging droplets bob. Caption: “把一小片晚霞，种成会发光的云。”
- `bubble_teapot` / 泡泡茶壶花: plant gives a tiny bow; 3 bubbles rise at staggered sizes with delicate pops. Caption: “倒出的不是茶，是一串慢慢飘走的泡泡。”
- `gramophone_flower` / 留声喇叭花: trumpet blossom pivots slightly toward visitor, short warm 4-note phrase; local concentric sound ring. Caption: “花瓣是一只小喇叭，收着春天的声音。”

## Authored demonstration gardens
See machine-readable `assets/garden-compositions.json`. These are designed spaces, not seeded random layouts. Coordinates are integer tile coordinates `x,z`, north = z-1. `L` is plantable land; `P` is nonplantable wood platform; dot is water. Edges attach to the specified existing cell, N/E/S/W. No plants on platforms. Every dry tile is connected; every occupied cell is unique. Decorations are only the approved four basic construction types; no new purchasable structure implied.

### 1. Kelly 的午后排练场 — “先听见，再看见”
A compact open amphitheatre, warm apricot and sage, one deliberate central timber stage. Three musical plants make an ordered back line; the gramophone and whisper radish act as flanking audience; a sunflower balances the warm palette. All six plants face the stage visually. The stage remains empty so the avatar can walk into the scene, not hide behind plants.
```
. L L L .
L P P P L
L P P P L
. L L L .
. . P . .
```
Main reveal: tap the drum at the centre of the back line. Then the ringing eggplant and keyboard corn provide visibly distinct, individually activated instruments; no ensemble. First arrival text: “这里没有乐队，只有各自藏着一段旋律的植物。”
Frame the empty stage as negative space; never add crops to fill it.

### 2. Bear熊 的月光慢剧场 — “给安静留一点位置”
A crescent-shaped sanctuary wrapping an open water pocket, not a full square island. Low stone walls only on the outer far rim. Two moon mushrooms are a purposeful pair of lamps; two cloud lanterns balance the ends of the crescent; sleepy sunflower is the protagonist and whisper radish the quiet companion. Muted lavender/aqua/golden light accents; retain readable cream UI and do not turn the whole screen dark.
```
. L L L .
L L P L .
L P . . .
L L P L .
. L L L .
```
Visitor now arrives at empty front land (2,4), not directly behind the south cloud lantern. Main reveal: sleepy sunflower yawns, then the user can tap one moon mushroom to light its own local pool. Arrival text: “演出很慢，先听一声哈欠，再点亮一盏月灯。”
The bay is intentional negative space; do not automatically fill missing cells.

### 3. 奶蛙 的海风实验室 — “拐个弯，又有新玩具”
A playful S-like coastal timber walk with three small paired planted pockets, visibly unlike the other two gardens. Actual browser review caught the initial diagonal map collapsing into a crowded vertical stack, so each new pair shares projected depth and the three pockets are separated by three depth steps. Timber platforms thread the pockets together; a short open-ended arrival deck frames the sea. The first pocket juxtaposes normal tomato and puffer tomato; second pocket combines wave cabbage and bubble teapot; third hosts painter tomato with another curling cabbage as rhythm. Palette accents aqua/coral/cream, never a randomized rainbow.
```
. P L . . .
. L P . . .
. . P . . .
. . L P P L
. L P P L P
. . . . P P
```
Main reveal: bubble teapot makes three floating bubbles, then painter tomato adds a short three-color trail. Arrival text: “沿着木道慢慢走，每转一个弯，都有一件不太正经的小发明。”
Keep the long silhouette and clear path; no fishing rods, docks labeled for fishing, fish ponds or fish inventory.

## Fixed-camera construction rendering recipe
Reference-driven illustrated construction art exists. Seamless procedural world geometry is also valid when matching the palette/line recipe; source tile geometry is artist-rendered, not mathematically perfect, so the manifest supplies measured footprint vertices and heightScale≈0.80 to fit the 2:1 grid.
- Land: exact grid diamond top, rounded/beveled corners, top-to-side ratio 2:1 projected; substantial warm earthen side thickness 12–16 CSS px, not a thin sticker. Slight grass lip on outside edges only; avoid dark seams across internal adjacency. Plantable top reads clearly from empty wood.
- Wood platform: same grid footprint, slim 7–9px thickness, pale warm wood planks with 3–4 broad visible grain hints. Keep gaps restrained and aligned to grid. No fishing details.
- Fence: two rounded warm wood posts with low two-rail span; edge-mounted, no full tile. Height about 32–38% of plant height. Generate/draw both diagonal orientations consistently; mirrored source is allowed only for near-symmetrical wood.
- Low stone wall: three subtly irregular cream-gray stones plus a broad rounded cap, height about 25–30% of plant height; lighter top face, quiet occlusion at base. Do not make it look like a castle battlement.
- Draw terrain first. Depth-sort plant/character/edge features by their ground-contact projected y; split far edges before residents and near edges after residents. Nearby front fence/wall fades to 0.35–0.55 only when actually occluding the avatar/selected plant, then restores.
- Tile side depth, avatar foot contact and camera scale must agree. No visual hovering, no stretched portrait standing in for fullbody.

## Tiny authored scenery
The composition JSON now places 17 nonblocking story accents: a blank garden sign at each entrance, music pennants and score notebook for Kelly, a crescent cushion/book nest for Bear, a paint kit and found shells for 奶蛙, plus restrained grass/pebble corners. They are NOT shop items or fifth construction kinds. Keep each prop small; plant faces and walking paths are primary. Ground stepping-stone decals render below residents. Do not auto-scatter these accents. The sign has no generated text; optional scene-specific labels may be rendered as readable local text.

## Visual acceptance once integrated
At 360×780 and 390×844: distinguish all three island silhouettes; detect the intended focal plant within two seconds; spot difference between basic tomato and puffer/painter tomato; read plants at default zoom without losing faces; see feet on the land; tap a plant without the tray covering it; see only the chosen plant respond. Inspect real screenshots and interaction clips, not isolated atlas success.


## Actual browser art review (2026-10-25)
Supported CUA, independent art tab on the new demo only; visits/navigation/screenshots, no economy mutations.
- v1: all plant atlas frames rendered clean. Music grouping read clearly; Moon arrival was occluded; Sea projected as a crowded vertical stack.
- v2: new contours, owners and17 story accents harmonize the world. Sea's revised3paired pockets/S-walk pass: every face readable, teapot/painter distinct, visitor/host clear.
- Remaining small fixes from v2: move music pennants to front stage edge (compositionv5, done) so drum face is unobstructed; refine plant fade to meaningful head occlusion instead of any body-box intersection so Moon's south cloud is not permanently ghosted on arrival. No plant regeneration required.
- Nice-to-have terrain polish: 1–2 tiny irregular embedded pebbles per visible outer soil side and a thin grass lip, not a texture noise field; keep exact connected geometry and readable plantable vs wood distinction.

## Scene atmosphere refinement (composition v6)
Use theme fields on water and terrain, not bitmap recoloring. Music = warm cream/apricot afternoon, pale sage water and honey timber. Moon = readable lavender twilight, cool sage ground, muted mauve-gray stone/earth and warm cream glints, never a dark overlay. Sea = clear aqua water, fresh green pockets and sun-bleached timber. Shared cream UI remains unchanged. These are intentionally stronger first-glance mood differences than the earlier three similar aquamarine views.

## Pumpkin lineage continuity
`piano_pumpkin` is the chosen playable descendant of `drum_pumpkin`: retain the orange ribbed shell, green leaf rim/feet and friendly face; replace the drum surface with ivory/cocoa keys. The species remains pumpkin, never corn. `star_drum_pumpkin` is a reserved optional alternate in the same small atlas, not a mandatory paid catalogue choice. Both source rectangles are in manifestv5, width102CSSpx, with their inherited family/parent art key documented. Lazy-load this atlas only after creation confirmation; initial3plant atlases decode to18,878,368bytes.

## v3 live art acceptance (17:06UTC)
Supported CUA on the new Site only. All three atmosphere palettes now read distinctly at a glance: warm sage/honey music, lavender/cool-sage Moon, bright aqua sea. Music pennants no longer cross the drum face. Moon's arrival cloud is opaque and visitor silhouette is clear. Sea retains six readable residents and three deliberately spaced pairs.
With parent-coordinated non-economic interaction touches, puffer and sunflower optional expressions appeared cleanly against actual aqua/lavender terrain: no dark RGB haze, rectangular matte or fringe; feet/leaf base stayed grounded. The sprites returned to base. Screenshot captures establish compositing and state appearance, not frame-to-frame blend smoothness. First selection re-centers the island once the context panel is shown; before/after captures alone do not establish whether the move happens during the hold or only after release. Shared QA economy remained112coins/3crystals throughout the art interaction window.

## v4 final piano acceptance (17:45UTC)
Actual supported-CUA view of the mature piano pumpkin in the shared synthetic home: inherited orange pumpkin silhouette/face and leafy rim read immediately, ivory/cocoa keys remain legible at default gameplay scale, alpha is clean against grass and aqua, root leaves sit on the tile without hovering. Original 牛来 stands adjacent and overlaps only a rightmost leaf, not the keyboard or face. This was read-only inspection after reload (observed106coins/2crystals), not an additional creation. No further raster or layout corrections required.

## Morning expansion: true giants + fictional album architecture
Scope approved2026-10-26: three2×2 giant plants and three2×2 memory buildings, no avatar changes or whole-world redesign. The world keeps the approved warm inked illustrated style. A shared three-photo source strip contains generated photorealistic snapshots of a fictional adult friend, calico cat and camping spaniel; clearly label every use 示例相册 / 虚构素材, not uploaded user material. A building detail should show its photo next to its illustrated transformation; the tiny world plaque is secondary, not the sole evidence.
Giant keys: giant_piano_sunflower, giant_moon_mushroom, giant_bubble_lotus. Building keys: portrait_rehearsal_pavilion, calico_reading_den, camping_dog_workshop. Plant footprints are[2,2] anchored at the northwest min-cell(x,z), occupying all four land cells. Render at footprint center [0.5,0.5] with depth pivot [1,1]; exact sprite source anchors are measured, not guessed. Buildings also reserve2×2 cells and are non-economic demo exhibits. Every garden gains two deliberate clear pockets, preserving a front approach and all old residents where they remain legible. Lazy-load the two large assets for the current garden; load source-photo strip only when memory detail opens.
Proposed reactions: sunflower key canopy responds to left/right strokes; moon mushroom breathes and releases a short crescent glow on a gentle hold; lotus releases one bubble per lobe tap. Portrait pavilion greets with scarf/coral flutter; calico den purrs with ear/roof lean; camping dog workshop wags/rocks and lights its lantern. Only selected hero reacts.

### Morning integration handoff
Main art manifestv6 supplies six full1254×1254RGBA hero originals with measured center-ground anchors; no legacy sprite changes. Each new giant occupies four LAND cells, each memory exhibit four PLATFORM cells. Normal draw widths224–228CSSpx for giants and214px for buildings intentionally exceed the one-cell art. Both hero textures are lazy per visited garden (~12.6MB decoded together); the1536×1024 fictional-photo strip loads only with album detail (6MiB). Final authored islands contain25Music /25Moon /29Sea tiles. Static validation confirms every nonoccupied cell belongs to the spawn's connected walking area, with clear owner and building entrances. Removed only three redundant fixtures: moon-lamp-west, moon-lantern-south, sea-wave-west. Their species/art remain intact and other exemplars remain visible; old author identities must remain runtime-frozen. Main new files: assets/memory-album-manifest.json and assets/morning-art-validation.json. Actual integrated art review is the next acceptance gate.

## Unified illustrated cast (2026-10-26, next revision)
The user explicitly replaced the former 3D screenshot presentation with matching handdrawn 2D characters. All twelve published IDs, names, outfits, signature accessories, colors and display heights remain unchanged. New production originals live in `assets/avatars-illustrated/<id>-v1.png`; each 1536×1024 RGBA atlas contains front, back and portrait views. `assets/avatar-manifest.json` v2 consumes exact individual source rectangles, with no destructive sprite crops or raster edits. Warm olive-brown ink contours and restrained painted cel shading match the plants/buildings. 牛来 and 苏贝壳 style proofs and the complete twelve-character contact sheet were approved by root before promotion.

Every identity uses one shared image across its two body views and structured portrait. Preserve legacy string-portrait support in runtime for compatibility, but the new manifest references no old 3D portrait/image. Keep old source sprites in repository only for rollback; public build whitelist must follow the new manifest. Selected avatar waits on its one unique image; other identities load lazily as their portraits or garden hosts appear. Total new PNG transfer size20,393,614bytes; decoded storage6MiB per identity,72MiB if all12 are eventually viewed. Do not preload the full cast at home boot.

Validation in `assets/avatar-art-validation.json`: all36 source rectangles are in bounds, isolated from neighboring painted silhouettes, and have border alpha below16/255. Original generated bytes are preserved. Front/back heights share per-character source scaling; measured ground anchors exclude wide tails, and dog feet—not its lower shield tip—define the ground contact. Diagnostic composites at original display heights show clean alpha on aqua/grass, intact head/ear/hat margins, readable costumes, no rectangular haze. Diagnostics and generation prompts remain in ignored `work/avatars-next`, not public assets. Final acceptance additionally requires supported-CUA profile-grid and three-garden host/visitor grounding inspection after deployment; static diagnostics do not establish live loading behavior.

## Construction-state and facing polish (2026-10-26)
`construction_site` is one reusable temporary 2×2 building-state illustration, not a new permanent construction type or another finished house. Low open timber scaffolding, rope joints, visible unfinished joists and tidy stone/plank/tool bundles make progress tangible while leaving a clear square floor. The original1254×1254RGBA source is retained at `assets/heroes/construction-site-v1.png` (1,229,533bytes /6,290,064decodedbytes). Load only while a personal building is under construction; no boot preload. Width214CSSpx, normalized ground-center anchor[.5,.65], footprint[2,2], render pivot[.5,.5], depth pivot[1,1]. Numeric countdown/progress belongs to runtime, not baked text. Basic terrain assembly remains procedural. `assets/construction-art-validation.json` records original hash, realalpha, bounds and occupancy contract.

All12 actual illustrated avatar front/back poses were visually audited: native fronts face screen down-left; native backs face screen up-right. The old common `mirror=(screen dx<0)` rule was therefore wrong for fronts but correct for backs. Correct four-diagonal mapping is down-left=front/no mirror; down-right=front/mirror; up-right=back/no mirror; up-left=back/mirror. With iso screenX=x−y and screenY=x+y, this is +x→front/mirror, +y→front/no mirror, −x→back/mirror, −y→back/no mirror. `nativeFacing` metadata documents this for each identity; no avatar image, frame, anchor, size or costume was changed. Runtime owns direction selection and its tests; do not globally invert the atlases.
