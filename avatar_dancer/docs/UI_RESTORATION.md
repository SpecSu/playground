# ENCORE UI restoration

Reference inspected 2026-10-29: https://dreamina-disco-avatars.mythicgleam32.chatgpt.site/
Public deployed artifacts: `/_next/static/chunks/LiveFeed-Bk4Ag9I1.js`, `/_next/static/css/LiveFeed.ByIrzMrQ.css`.

The reference actually uses Unicode arrows, not SVG icons: ← ↑ ↓ →. Its distinctive look is system sans heavy weight, four directional colors (#ed8cc7 pink left, #b0e98a green up, #79c9ff blue down, #ffc579 amber right), neon receptors, rainbow hit line, ring/eight radial shard impact, and scale recoil. Restored these elements; kept ENCORE's existing left/down/up/right lane mapping so controls/chart semantics do not change. PERFECT maps to the reference's strongest COOL impact; GOOD gets a quieter burst and MISS no positive burst. Reduced-motion mode suppresses particles, scale motion and loader scans.

Track title/time and progress move to the screen top (safe-area aware), above brand and score. Song status no longer crosses the head. Outfit previews use full-body contain instead of cover, without selected zoom; taller preview cards balanced with compact spacing. (New thumbnails produced separately.)

Model loading: spotlight/silhouette, scan and progress bar. Only numeric stage byte progress generates percent; 100% download is labeled assembling until ready. Song loading: beat-light waveform and moving scan, indeterminate during file reading/decoding/analysis (no invented percentage). Errors remain readable and retry through the existing controls. Loading panels don't intercept input. Ready state fades out; no imposed minimum delay.

Verification: unit tests added before implementation and observed failing; 56 tests passed after changes; production build passed (existing bundle-size warning). Local screenshot QA initially blocked by Chromium socket restrictions; escalation failed at environment mount setup. Do not treat a successful build as visual QA. Parent coordinating cloud-browser review.

## Browser review
Parent reviewed the supported cloud-browser local UI fixture (no injected live-game state): top-edge song progress, original-style arrows and neon targets, waveform loading, ready dismissal. WebGL is unavailable in that cloud browser, so it cannot certify live 3D/head alignment or dance rendering. Geometric projection audit separately confirmed normal head13–20% vs progress~4%; close-up model loader docks at10% with compact height above portrait. Parent requested dancer-pose silhouette refinement after initial review; implemented clean inline SVG pose, replacing generic person pictogram.

`qa-fixture.html` is local-only, ignored, not included in Vite dist, and MUST be removed before final packaging/publication. No live fake-game/debug mode was added.

WebGL unavailable regression: explicit `available:false` hides model loader, retains renderer's explanatory notice, disables Start and exposes `stageUnavailable` diagnostic. Does not falsely imply that 3D loading succeeded.

## Asset cache identity
`src/asset-revision.js` applies stable release revision `20261029-neck-v2` to runtime model URLs and thumbnail URLs. Manifest JSON is fetched with `cache:no-store`; raw offline manifest file paths remain untouched. GLB HTTP caching and session parsed/byte caching remain enabled. Repeated selection uses identical versioned keys; changing release revision invalidates stale browser models/thumbnails without disabling caching. Tests cover all twelve model URLs, nonmutation, stable repeated keys and query/hash preservation.

## User-requested ENCORE palette alignment (later revision)
Keep the restored glyph/font, direction order and effects. Change left to exact interface pink `#f56aa8`, up to exact interface lime `#ddff72`; coordinate down with lavender `#b7a4ff` and right with mint `#7ee5cc`. Falling notes, receptors, key tint/border/press glow and radial bursts share each direction's color; hit-line gradient follows the same left/down/up/right sequence. PERFECT uses lime, GOOD mint, MISS pink with current-color glow. Direction remains readable by shape, not color alone. Tests require ≥4.5:1 glyph contrast against the dark key surface. No layout changes in the palette adjustment.

Pause secondary action now says “回到大厅” and invokes existing lobby lifecycle rather than replay. Results replay remains independent. Returns focus to lobby Start while preserving current character/outfit; run/audio reset handled in main.

Lobby top-right “好友榜” opens an accessible, background-inert “今日好友总分” modal. The UI consumes `onRank()` daily-total rows and does not itself aggregate runs. “你” row and summary show today's local completed-run sum; mock friend values are explicitly labeled. Esc/close/back restore entry focus; modal does not alter stage game mode. Results list explicitly says “本场好友舞台” to distinguish round score from daily sum.
