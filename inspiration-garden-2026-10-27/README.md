> **交接阅读提示：** 本文件保留阶段性工程记录，部分数值、素材描述已被后续版本替代。最终 v36 状态以 `HANDOFF.md`、当前代码与 manifests 为准；历史参考目录不参与运行。

# 灵感花园 / Inspiration Garden

A standalone mobile-first, fixed-isometric planting toy. Buildless browser ES modules, Canvas2D, WebAudio, and **browser-local-only** progress. No login, backend, real payment, real-time AI generation, or actual multiplayer.

## Run and verify

Requires Node 22+ for development checks and Python 3 for the optional static server. There are no package dependencies to install.

```sh
npm test         # deterministic rules, save recovery, math/input/audio, UI contracts, safe build
npm run check    # syntax check every runtime/build module
npm run build    # sync authored compositions, validate referenced assets, whitelist-copy into dist/
cd dist && python3 -m http.server 4173
```

Open `http://localhost:4173`. The new project uses only the fresh localStorage namespace `inspiration-garden:v1`; it never reads or migrates old manor saves.

## Play

- Start on four land cells with120coins,3crystals and2radish seeds. Only the original first basic crop gets15-second tutorial growth. Four optional 2×2 trees unlock after 12/24/40/60 sales: buy 180/600/1800/6500, mature sale 270/900/2700/9750 coins, and grow for 45 minutes/3 hours/8 hours/24 hours. This explicit local-demo rebalance reappraises old official holdings without rewriting saved raw tariff records or existing planted readyAt; original basic crops remain unchanged.
- Bottom navigation is **种植 / 建造 / 串门**. Planting has种子/收获 categories. Stocked green seed cards plant through their main area; separate+1 controls buy immediately with coins. Known empty-stock varieties remain muted below. There is no purchase confirmation rail. Keyed controls preserve focus and scroll; a bounded pointer-intent guard prevents first-acquisition reordering from becoming a wrong click.
- Mature plants can be packed/re-placed as the exact same instance or sold once directly from land/收获. Growing plants cannot newly be packed. Legacy already-packed growing instances remain losslessly restorable with their original timestamps.
- Offline seed creation and fixed-parent family remix each use one text field and one crystal on an actual supported new result. Unsupported/identical/owned results do not consume another crystal. Finite authored samples are disclosed; there is no arbitrary live AI.
- New land/platform/fence/wall use3-second assembly; personal houses use15-second scaffolds. Each supported new permanent blueprint costs 1 crystal and each instance 60 coins. Six free owned personal blueprints appear once for both new and existing saves: the 2×2 cat, a slender 1×1 yellow pen, a low 2×1 Roadster, a 1×1 camera, a 2×2 scallop house and a 2×2 camping canopy. No currency is granted or spent, and no building is automatically placed. Existing cat blueprints retain their IDs and author chains without duplication. The trio and cat each reserve one distinct-sample slot for full legacy collections (at most104 records); ordinary blueprint creation remains capped at100. Jewelry is absent from the 20 active building samples, but historical blueprints, author chains and placed/packed instances remain intact. Houses are not packed/sold: relocation20coins, demolition50coins, no refund. A quiet legacy buildingBag return route preserves older instances. Fence/wall placement previews the actual translucent edge; touch confirms the selected ghost and chooses a new edge before confirming it. Desktop hover confirms only its last painted edge; pan/cancel never builds. Every house/worksite cell is nonwalkable; routes/approach stands stay on completed supported ground outside the whole footprint. New layout actions cannot cover the current actual actor or sever current/future free walking connectivity.
- Published legacy all-house layouts remain loadable without checksum/head writes. Safe entry selects existing free ground; if none exists the actor waits offstage while management remains usable. Only an eligible old all-blocked layout below18coins can explicitly confirm one fee-waived recovery removal of an owned completed house; blueprint stays, no land/coins/debt are created. Ordinary demolition remains50.
- Four authored **demonstration** gardens (吉吉 anime, Kelly music, Bear toy design, LX technology/sport) retain original author/remix credit and shared per-variety Beijing-day seed quotas. Each host independently strolls; nearby idle characters occasionally exchange finite local two-turn lines. No autonomous rewards, economy, demo eligibility or save writes occur. Owner commands interrupt immediately; camera/menu/editor browsing does not reset the10-second semantic idle clock. Hidden pages pause safely.
- Owner walking receives gentle camera follow with manual-view priority and a short inspection grace. Actual held controls lock image bounds. Hosts never pull the camera. Shared routes prefer clear landscaped paths, falling back to soft-plant walking only on dense farms. The sea is uniform pale aqua with no illustrated background or decorative ripples.
- Both creation entries sit in compact panel-bottom shelves. Plant/building 🎲 buttons fill a supported idea without submitting or spending; both idea fields and placeholders use16px text. Five free curated terrain tones (嫩绿、雾蓝、浅玫、沙白、浅棕) apply to all own land, including future cells, without changing sea or artwork.
- Click a moving demo host to approach a reachable outside position and face each other. The explicit session offers only合影/送东西 and temporarily holds both actors; closing, hiding or a new gameplay command releases it. Gifts consume exactly one selected seed or mature packed plant in a clearly labeled **local simulation**, with full provenance in a permanent capped60-record log; no real friend is notified.
- Four lazy offline illustrated Polaroid PNG samples show fixed苏贝壳 with each host in the final themed garden. They are not screenshots or realtime current-avatar generation. View/long-press/savePNG are explicit; stale loads cannot replace another scene.
- 串门 shows stable今日/本周 mock sale-income ranking with explicit example labels, never wallet balances. Successful ground/harvest sales reuse the verified old gold coin SVG, flight animation and user-provided WAV; mute/visibility/reduced-motion and bounded lifecycle cleanup are respected. See `docs/legacy-coin-provenance.md`.

- The top-left identity opens 苏贝壳的衣橱: original outfit plus 山野漫游、花园慢作、轻快出发、暮色来访. Legacy selected-role bytes remain loadable, while player presentation consistently uses Su; other identities remain NPCs. Only a loaded selected outfit may commit.
- Rare animal guests occasionally stroll on a friend island, at most one, never at home. They are cosmetic, nonblocking and not photo/gift recipients.
- There is no background music. Existing plant, cat and coin effects use the shared gesture-unlocked context with mute/hidden cleanup. Soft cream clouds cover the actual visit/home handoff; preparation has a bounded fallback to placeholders, and canceled/stale requests cannot change the scene.
- The fluffy cat has a fixed-base fish toss/catch/chew/lick/happy sequence, not a fish resource. Its source card shows the authorized normalized cat photo with **提供于 2026-10-26**, not an invented capture date. Personal memories retain distinct object-source cards and modest, object-specific responses; the historical necklace keeps its source and chime response.

## Architecture

- `src/state.js` — pure time-injected atomic transactions; rejected actions cannot partially spend. `reduce` returns `{state, ok, message, effect}`.
- `src/construction.js` / `src/worksite-view.js` — optionalpaired work timestamps, deterministicreadiness/progress and genericvisualworksites. Storage and terrain rearrangement validate everyfuture completionfrontier, not only current/fullconnectivity. View refresh doesnotdirty/save progress.
- `src/blueprints.js` — trusted eleven-sample architecture/provenance projection with canonical 1×1/2×1/2×2 geometry and permanent blueprint validation; construction60/relocation20/demolition50 are constants, never trusted saved prices. Existing photo-derived sources and new hobby/illustration sources are labeled separately.
- `src/catalogue.js` — bounded economics, offline samples, immutable author identity independent of mutable garden layouts, and normalized demo compositions. `src/footprints.js` centralizes canonical support/overlap and placement ghosts.
- `src/storage.js` — validated checksummed primary + previous-revision recovery. Corrupt storage is never silently discarded: a recovered primary is archived byte-for-byte before replacement, while fully unreadable saves require explicit archive/new or temporary play. Old checksummed v6 data is validated before optional empty-bag defaults, with unchanged expected-head bytes. Cross-tab writes use exclusive Web Locks and expected-head checks; unsupported browsers fail closed into clearly labeled temporary play without touching existing progress.
- `src/scene.js`, `scene-math.js`, `gesture.js` — fixed isometric projection, pan/zoom, depth ordering, safe input, local animation. `visual-walk.js` routes presentation-only walking through connected tiles; natural walking takes about380ms per grid cell with one route-wide start/stop envelope; new taps replace the route; physical arrival and facing precede interaction.
- `src/plant-controls.js`, `src/exhibit-controls.js`, `src/interactions.js` — tested hold/release, key-scrub, drag, zoned taps, light toggle/secret and local WebAudio signatures. Audio requires a user gesture; mute is persistent.
- `src/edge-placement.js`, `src/cloud-travel.js`, `src/animal-visitor.js`, `src/cat-feeding.js` — bounded transient preview/travel/guest/snack controllers; none owns economy or save writes.
- `src/gifts.js` / `src/terrain-palettes.js` — finite local gift recipients, permanent receipt validation and trusted whole-island cosmetic presets.
- `src/photo-sample-view.js` — lazy same-origin PNG signature/decode/download controller with session cancellation and object URL cleanup.
- `src/ui.js`, `app.js` — one shallow DOM sheet/context layer; mobile safe-area controls.
- `assets/art-manifest.json` — replaceable transparent plant/terrain sprites and source rectangles. Approved `interaction-art-manifest.json` adds two lazy expression strips; the cat face/fish sprites are separately lazy and leave all base art authoritative. `assets/garden-compositions.json` — four deliberately composed gardens; `npm run build` syncs the generated `src/gardens-data.js`.
- `assets/avatar-manifest.json` — twelve stable character identities redrawn in the map's handdrawn2D style. Front/back and portrait can share one atlas per identity. The reference adapter still supports legacy portrait strings; every visible portrait is manifest-driven Canvas. Originalmanor source assets are untouched; refer to manifest provenance.

## Honest MVP limits

Content is authored, finite, and local. There is no server clock or economy security against editing browser storage/system time, no live player visits, no user photo upload, no actual AI generation, no cloud sync, no real purchase, and no arbitrary building-generation service. Audio availability depends on browser support. Clearing site data clears local progress.

Public deployment is handled separately by the parent task to the authorized original experience Site. The old fishing garden, its Site identity, backend, and player saves are out of scope and untouched. `dist/` contains only web runtime and manifest-referenced assets: no work notes, user reference screenshots, docs, raw GLBs, .git, hosting config, or diagnostics.

Current candidate: planted friend courtyards. Jiji36supports/10plants (7crimson roses), Bear36/8 and LX36/9 retain approved buildings and open approaches; Kelly28/4 keeps its composition with short boundary detail. Existing grey stone walls/wood fences frame grouped beds and two inset planted pockets without closing paths. Jiji uses approved perspective/ground-anchor corrections, without changing footprints or world positions. Parent native browser QA and independent review gate publication. Automated checks do not replace actual 360×780/390×844 browser visual/input review.
