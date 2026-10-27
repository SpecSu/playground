# Inspiration Garden — morning touch revision

User delegated the interaction decisions and authorized public updates. This document extends the published v6 contract; unchanged economy, original twelve avatars, offline disclosure, safe save protocol, fresh namespace and untouched old manor remain binding.

## Touch and movement
- Walk naturally at about 380 ms per grid step; ease route start/end, never pause at every intermediate tile. Continue using connected land/platform BFS, replace old route immediately and never cross water.
- Direct touch stays the primary play control. Remove the replay button. Compact own-plant actions are 收进背包 / 摇出种子 / 卖出, with a quiet 改造 link. Demo assets cannot be packed or sold.
- Packing moves the exact instance into optional `plantBag`; restoring moves it back, preserving id, variety, plantedAt and readyAt. Time continues while packed. One instance cannot be sold twice or seedified by packing.
- Mature shaking yields one deterministic same-variety seed per local visitor + variety + Beijing calendar day. Share the existing `claims` quota across own/demo copies, packing and restoration. Demo interaction remains required before a demo shake.

## Creation
- Dock label 创造 always opens original creation. Plant/known-seed 改造 opens a fixed-parent remix. No mode tabs, parent selector, sample grid or lengthy preview paragraphs.
- One idea input, one submit action with 1 水晶 visible; one optional short hint. Match supported offline samples only on submit. Unsupported and incompatible requests show concise no-charge inline feedback. Personal duplicate offers reuse with coins, never another crystal.
- Preserve pumpkin family and all legacy provenance. Do not advertise arbitrary live AI.

## Footprints and authored exhibits
- Three authored giant plant varieties occupy genuine 2×2 land cells. Canonical footprint comes from trusted content, not arbitrary input fields. Northwest grid anchor expands toward +x/+y; rendering root is footprint center.
- Every placement, overlap, move/reclaim, pack, restore, sale and save-recovery path respects all occupied cells. Invalid insufficient-space previews are clear and atomic.
- Three fictional album-inspired exhibit buildings are authored demo fixtures only, with artist-owned ids/art/footprints and tactile interactions. No new purchase/creation economy.

## Save compatibility
- Same version/namespace. Validate the original checksummed envelope before applying optional defaults; old saves without plantBag load losslessly and keep their original disk head for expected-head protection.
- Optional fields must reject malformed/overlapping data; old valid recovery behavior and corrupt-byte archive remain intact. New saves preserve whole-plant bag instances and giant footprints.

## Acceptance
Pure rules, storage compatibility, UI markup/controller, walking and footprint tests; full test/check/build; parent native browser QA and independent release review. No deploy/push by implementer. Artist owns art and composition JSON.

## Later user correction — mature-only packing (2026-10-26 05:18 UTC)
- Newly packing a growing plant is forbidden: its context omits 收进背包 and the pure reducer rejects before maturity without any mutation. Packing becomes available exactly at readyAt. Mature packing and all other actions are unchanged.
- Existing saved growing specimens already in plantBag remain valid, keep their original identity/timestamps, and may be restored losslessly. They cannot be packed again until mature. No migration, deletion, version or namespace change.
