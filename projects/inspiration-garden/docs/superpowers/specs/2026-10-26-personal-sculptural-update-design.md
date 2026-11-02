# Personal sculptural assets — current six

## Scope and authority

This document supersedes both the original six-subject proposal and the intermediate three-subject scope. The latest selected set is **cat, modern silver necklace, Roadster-inspired car, Fujifilm X-T50 camera, scallop-shell house, camping tarp canopy**. The user paused yellow LAMY redesign and abandoned the proposed seaside-film and umbrella subjects. Keep the existing pen's code, imagery, source image, display copy, footprint and interaction unchanged; do not add film or umbrella.

The first three retain existing identities; the last three are new personal prebuilt samples, not NPC estates. Preserve the separately completed compact-price UI changes. Execution is delegated to independent workers; the user explicitly authorized this batch to update the existing public link; root retains publication ownership and the final review gate. No public upload/deployment is implied by local implementation or build. Root approved and informed the user of the canopy fallback: reachable-edge approach, gentle fabric response and a lantern, not a new seated-avatar pose system.

## Direction and alternatives

Chosen direction: contemporary sculptural forms with Gehry-inspired folded/curved shells, displaced volumes and deliberate negative space, translated into the established warm illustrated 2.5D isometric world. Keep warm charcoal-brown contours, restrained cel shading, cream/soft-silver material, and modest contact shadows. Avoid photorealistic glossy metal, classical arches, stone chimneys, timber door surrounds, dense cottage flowers and giant objects with house windows pasted onto them.

The rejected alternatives were cosmetic recoloring of the old cottage forms (does not address the user's complaint), or a photorealistic titanium-building set (breaks the game's art style). The Roadster is deliberately an actual sculptural sports car, not forced architecture. The following names and art treatment are implementation proposals within the selected direction, not claims that the user supplied exact names.

| Canonical identity | Display name | Art brief | Fixed footprint |
| --- | --- | --- | --- |
| `fluffy_cat_cottage` | 绒云曲廊 | White overlapping shells follow long-fur flow; khaki inside folds echo the real cat's ears and tail. A recognizable warm-white/gray-khaki cat face remains the living front focal point. Tail becomes a side curl. No traditional cottage underneath a giant cat. | `[2,2]` |
| `necklace_memory_monument` | 银弧纪念庭 | Fine silver chain and a smooth asymmetrical silver teardrop/oval pendant, translated into offset slender silver arcs and a suspended curved shell with generous open center. Completely discard thick gold links, diamond-shaped gemstone and pointed Gothic arch. | `[2,2]` |
| `airforce_memory_house` | 离地一瞬 | Roadster Rocket-inspired low sports car: sculpted white/silver body, dark continuous canopy, small warm tail accents. Rear upper-left to nose lower-right along +x. No doors/windows that imply a house; no airborne idle pose baked into the sprite. | `[2,1]` |
| `xt50_memory_camera` | 瞬间镜馆 | Recognizable silver/black X-T50-inspired camera mass and prominent circular lens, transformed through offset folded shells and an aperture-like sculptural lens volume. Retain tactile dial cues without a literal enlarged camera with house windows. | `[1,1]` |
| `scallop_shell_house` | 潮汐扇屋 | A broad scallop fan unfolds into five or six radial thin-shell ribs, cream exterior with a restrained pale-coral interior. Asymmetrical lifted edge forms the entrance; no masonry cottage or giant clam face. | `[2,2]` |
| `camping_tarp_pavilion` | 风停营地 | Lightweight taupe/cream tensile tarp, slender supports and a lifted sculptural sail edge; small camping chair/lantern accents, no enclosed heavy hut. Clear front silhouette and safe overhang-edge approach. | `[2,2]` |

## Identity, source and copy contract

Keep all three existing sample/art keys, all owned blueprint IDs, instance IDs, root/parent/author chains, costs and construction timing. `airforce_memory_house` remains a compatibility identifier, not visible shoe copy. Existing occupied cells, render/depth pivots and walk blocking remain unchanged. Preserve `estate-content.js`, economic values and existing authored layouts. Root approved exactly one owned blueprint for each of the three new sample directions on new and existing saves, with an independent idempotent migration and no currency gift. Storage may validate and hydrate this narrow migration without rewriting raw saves on read. A maximum of 103 owned records is allowed only when the excess is covered by one owned copy of each distinct new direction; normal creation still stops at 100 before charging. Kelly's later visual-only extension is specified separately in `2026-10-27-kelly-wonderland-design.md`; the other three NPC islands remain unchanged.

| Subject | Source-frame contract | Source-image contract | Exact proposed source copy |
| --- | --- | --- | --- |
| Cat | Keep `fluffy-cat-real-photo` and `sourceType:'user-provided-photo'` | Keep `assets/album/fluffy-cat-source-photo-v1.webp` byte-identical | Keep date `2026-10-26`, date label `提供于`, and `我的猫咪`; story: `熟悉的暖白长毛、灰卡其耳朵和蓬松尾巴，化成一座舒展的曲面小馆。轻碰一次，抛一条小鱼，等它吃完开心一下。` |
| Necklace | Keep `necklace-memory-photo`, memory source type | Replace its image reference with `assets/album/modern-silver-necklace-photo-v1.webp`; old ornate source must not remain referenced by the runtime album | Title `一条简洁的银色纪念项链`; label `纪念 · 细银链与非对称吊坠`; story: `细银链与一枚不对称的银色吊坠，化成留着光与风的纪念庭。轻碰吊坠，让安静的曲面响起一声清亮回音。` |
| Roadster | Change sample sourceFrameId to `roadster-rocket-memory-photo`, memory source type; remove obsolete `airforce-shoes-memory-photo` from runtime album | `assets/album/tesla-roadster-inspiration-v2.webp`; generated illustrative source, not a user's actual vehicle photograph | Title `Roadster Rocket 的贴地飞行想象`; label `概念 · Roadster Rocket 灵感`; story: `把未来跑车的想象停在小岛上。轻碰车身，短促气流把它托离地面一点，再轻轻落回原处。` |

Do not claim that hovering is a verified production feature, that the user owns this car, or that generated concept images are user uploads. For the new three, source cards must describe illustrative object/camping inspiration, not imply an actual user photograph or unprovided personal biography. Use existing disclosure fields; do not expand the UI system. Update existing source stories/transform cues to match new visuals. Album sources remain lazy-loaded metadata-free WebP. The build copies every album frame image: obsolete shoe/ornate-necklace references must be removed rather than only hidden in UI.

## Asset handoff and measured framing

Art workers produce isolated transparent hero images, no tile/base island/text or baked broad glow; retain full-resolution private masters; root-approved runtime crops are downsampled to measured maximum-zoom/DPR needs. Deliver actual image dimensions, tight frame, alpha bounds, measured ground-center anchor and reaction landmarks in a small sidecar. All runtime hero and interaction entries remain `preload:false`.

Default delivery paths (root may reconcile actual worker filenames before integration):
- `assets/heroes/fluffy-cat-cottage-sculptural-v2.webp`
- `assets/heroes/necklace-sculptural-courtyard-v1.webp`
- `assets/heroes/tesla-roadster-hover-v1-runtime.webp`
- `assets/animations/fluffy-cat-feeding-face-atlas-v3.webp`
- The two new source images named above; cat source is unchanged.
- New heroes: `assets/heroes/camera-sculptural-v1-runtime.webp`, `assets/heroes/shell-sculptural-v1-runtime.webp`, `assets/heroes/canopy-sculptural-v2-runtime.webp`.
- New source cards: `assets/album/camera-sourcecard-v1.webp`, `assets/album/shell-sourcecard-v1.webp`, `assets/album/canopy-sourcecard-v1.webp`.
- New source frame IDs: `xt50-memory-photo`, `scallop-shell-memory-photo`, `camping-tarp-memory-photo`; all use memory source type and clearly illustrative source metadata.
- Cat base candidate already approved by root: `work/sculptural-cat-v1/cat-sculptural-base-candidate-v1.png` (convert/integrate only with matched face atlas).

Cat width target 214 CSSpx, necklace 188–200 CSSpx, car 175–185 CSSpx at zoom 1; adjust the exact value only after integrated footprint inspection. Existing cat/necklace renderPivot `[.5,.5]`, depthPivot `[1,1]`; car renderPivot `[.5,0]`, depthPivot `[1,0]`. Ground anchors must be measured from new art, not blindly copied. Preserve the car +x orientation and the logical footprint even while hovering. The pen's current height/framing must not change. Final measured camera width is 89 CSSpx, shell 200 CSSpx and canopy 155 CSSpx. Root approved changing only the new canopy to 2×2 because the approved four support feet did not fit a legible 2×1 rendering. New 1×1 pivot/depth is `[0,0]`; new 2×2 is `[.5,.5]`/`[1,1]`.

## Cat animation dependency

Current `src/cat-feeding.js` assumes a 1254-square base; face center `(456,456)`, width368, atlas frames368×256, fish path `(1320,980)` through `(850,-70)` to mouth `(420,480)`. The six current frames contain fur/background, not just isolated eyes/mouth, so pasting them onto redesigned architecture can create obvious rectangles.

Deliver the new static cat and six matched face frames together: anticipation, bite, chew, chew-b, lick, settled. Preserve the existing 3000ms sequence, reduced-motion 950ms sequence, one fish only, repeated-press coalescing and fixed building base. Retain the existing fish-treat asset unless its art actually conflicts. Parameterize the face/path geometry against the new frame; preserve legacy default geometry for existing function tests. Check edges and color continuity in the actual game, not only the atlas.

## Roadster interaction and lifecycle

Use ephemeral control state `hoverAt` and a pure `roadsterHoverSample(elapsed,reduced=false)` helper. No save mutation, actor displacement, collision changes, rewards, inventory or network calls.

Normal sequence is 1800ms: 0–250ms short underside gas pulses while grounded; 250–650ms ease up to **12 CSSpx at zoom1**; 650–1100ms hold; 1100–1650ms gently descend; 1650–1800ms settle; then zero lift/jets. Short jets are white/aqua gas, not long rocket flames. Repeated presses during 1800ms do not restart or stack. Pointer release does not truncate the finite sequence. Reduced motion lasts 650ms, no lift or moving jets, just restrained stationary feedback. On scene hide/change/dispose, clear the sequence; returning must not resume an abandoned hover.

Only car body and its art hit region translate vertically. Contact shadow remains centered on the same ground coordinate and may soften/shrink during lift. Footprint, depth-sort ground point, construction/relocation previews and navigation never move. Add 12px camera-fit headroom for active car art so top edges cannot clip. Jets originate at measured underside landmarks and stay local. Existing necklace `chime` remains, but the pulse origin must match its new pendant; no obsolete gold-jewel position.

## New-three data and interaction contract

New IDs: `xt50_memory_camera`, `scallop_shell_house`, `camping_tarp_pavilion`. They belong in `BUILDING_SAMPLES` and personal creation suggestions, not NPC estates. Use the existing 1-crystal blueprint /60-coin construction path and15-second build. Preserve existing sample ownership and grants; add only the three independently authorized starter directions once. New source titles respectively: `Fujifilm X-T50 的镜头灵感`, `一枚扇贝的海边想象`, `露营天幕下的一小片阴凉`; story/transform cues must match actual delivered images without invented real-user memories.

Camera response: one brief aperture/lens glint and quiet shutter beat, no simulated recording, saved photos or flash filling the whole screen. Scallop response: one gentle pearl glow moving across radial ribs, no hinge-opening collision change. Canopy response: existing reachable-target approach stops on completed free adjacent ground outside its entire solid 2×2 footprint; tapping produces subtle local fabric motion and lantern feedback. Never make blocked canopy cells walkable, move the avatar into a chair, stretch an existing standing avatar into a seated pose or add outfit frames. Real seating would require new aligned pose assets across current outfits plus correct canopy/chair foreground ordering, and is explicitly deferred. Prefer the authored adjacent offset `[1,2]` from the canopy footprint minimum when completed, empty and reachable. Otherwise use another empty reachable neighbor; if every neighbor is planted or blocked, return normal cannot-approach feedback. Plants may remain traversable en route, but this canopy interaction never stops inside a plant. No collision exception is added.

The new reactions are finite cosmetic effects with no inventory, rewards, world mutation or automatic repeated ensemble. Preserve reduced-motion and audio-mute behavior. Each hero handoff includes normalized local reaction landmarks (lens/rib glow/lantern and cloth region) so code never guesses a reused old-building coordinate.

## Acceptance and boundaries

- All six items must be grounded and readable at normal and maximum zoom, with narrow-layout checks at 360–390 CSSpx. The existing pannable close-entry camera may crop outer island sides; do not claim all six fit simultaneously on every narrow screen.
- Cat original source bytes/provenance/date survive, and all six feeding states align without seams.
- Necklace source and sculpture use the new modern silver motif; no runtime old-gold imagery.
- Car source/card/suggestions no longer mention shoes; hover visibly lifts, emits short gas pulses and returns exactly to ground, including rapid repeat taps and reduced-motion mode.
- Existing saves and legacy packed-building return retain exact identity, footprints, money and authorship; the three new samples have tested construction/relocation/save behavior, and pen and the other three NPC islands are unchanged; Kelly follows its separately approved visual-only extension.
- Compact-price UI edits remain intact. Complete `npm test`, `npm run check`, `npm run build`, then integrated local visual QA. A successful build is not permission to publish.

Reference language: [Guggenheim Bilbao material description](https://www.guggenheim-bilbao.eus/en/the-building/the-construction), [Fondation Louis Vuitton building description](https://www.fondationlouisvuitton.fr/fr/fondation/le-batiment). Root verified Roadster concept context at [Tesla Roadster](https://www.tesla.com/roadster); the game interaction is an imaginative interpretation.

## Final approved additions and first-tap loading

The user also approved a sixth `christmas-santa` outfit, with matching selected-only body loading and lightweight preview/portrait. Existing five outfits and current selection remain unchanged. Cat feeding prewarms only when the current island contains the cat; a delayed first tap queues one snack and starts its full timeline only after both face atlas and fish are ready. Failure permits retry; hide, cancel, removal and disposal discard stale plays. The cat hero + face atlas + reused fish total 674,382 bytes, down from 877,488 bytes.
