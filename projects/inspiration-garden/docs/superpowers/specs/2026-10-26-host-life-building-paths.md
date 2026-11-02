# Moving hosts and solid building footprints

Binding request after v15 (`93d7c933`): authored garden hosts also stroll and occasionally exchange random contextual lines with the visitor. All four cells of personal/demo houses, including worksites, are nonwalkable.

## Navigation and compatibility
- One shared navigation filter: completed land/platform minus actual 2×2 building footprints. Plants are not a new hard navigation obstacle. Manual travel, owner idle, host routes and interaction approaches use this same set.
- A building target resolves to a reachable supported neighbor OUTSIDE its whole footprint. No route means no movement or teleport and a concise manual-action hint. Every queued route is revalidated when obstacles change; invalidated routes stop at the current still-safe pose.
- New construction, relocation and legacy restoration must leave completed walkable terrain and cannot cover the actual transient owner position. UI forwards a validated presentation position for reducer preflight; it is not new persisted data. Invalid/canceled commands retain all balances/identity. Prices/timing remain60/20/50 and15s.
- Existing raw checksums/schema/head stay permissive and byte-preserving. Root approved an exceptional recovery at initial load/adoption only: if the saved spawn is blocked, choose the nearest existing safe tile before showing the actor, with no save write. An all-house island hides the actor and clearly says to expand first, while expansion/move/demolition remain available. When a new real tile finishes, show the actor at that safe spawn as recovery, not an ordinary traversal. No free land, asset deletion or extra fee.
- The three authored friend layouts retain all IDs/coordinates; excluding house cells leaves connected21/21/25-cell walking areas.

## Host presentation
- Separate transient walker per host, same380ms/cell easing and audited facing. Short reachable routes, random pauses; no collisions/reservations added to player navigation. Host may stroll while the owner acts. No camera movement, persisted positions, dispatch, rewards, demo eligibility or audio unlock.
- When currently sampled actors are nearby in connected safe space, and the owner is eligible/idle, pause both autonomous routes briefly, face each other and show two3-second local contextual lines. Random finite authored pairs, no immediate repeat; one shared dialogue at a time,45-second encounter cooldown. Actual owner intervention immediately clears own dialogue/route and releases host pause; it never resumes a stale owner command.
- Camera/menu/editor browsing retains v15 semantics. Hidden/blurred/loading/blocked scene suspends host without catch-up; return schedules a fresh short pause. World switch/removal/dispose clears host routes/dialogue.
- Rendering depth, shadow, facing and dialogue bubble use the host's sampled pose, not authored spawn. No DOM replacement during autonomous activity.

## Scope
No economy/schema/catalogue/art changes in this runtime slice. Tree art and the isolated coin helper are separately reviewed additions. Bottom creation rails belong to a separate UI slice.

## Additional approved safeguards and exceptional recovery
New house construct/relocate/legacy-return must keep all remaining completed free walking cells connected at every pending terrain readyAt frontier, in addition to not covering the real actor. This is an action preflight only, not a stricter legacy loader. Terrain reclaim/move receives the actual transient pose too and cannot remove its support or newly split the free walk graph.

Root explicitly approved a self-service exception for an otherwise dead-ended published layout: only when completed terrain exists but every completed cell is blocked by houses/worksites AND coins<18, a player may select one OWN completed house in 建造 → 旧版布局恢复, then explicitly confirm 恢复落脚空间（本次免拆除费）. That exact instance is removed once, its permanent blueprint stays, and no coins/refund/land/debt is created. Pending/demo houses never qualify; predicate and ID are checked again at confirmation. No automatic removal. Ordinary demolition remains50. Zero-coin full-house fixtures must roundtrip raw bytes before this optional command.

## Final current-round integrations
Owner-only smooth camera follow preserves zoom, gives manual drag/pinch/zoom two seconds of inspection priority, and locks through actual pointers/candidates/held interactions. Hosts never steer the view. No persistent camera/activity data.

The latest user request supersedes the earlier purchase-session flow entirely: direct one-seed buys, no bar/完成/popover/inert grid. Stable keyed card/native buy controls preserve focus/scroll through owned-first resort. UI pointer identity plus a500ms/26px old-position guard only after first acquisition prevents accidental different-action taps; keyboard and intentional same-variety+1 remain available. Both create bars are compact bottom shelves. Today/week friend rankings are explicitly mock local sale income, read-only.

Successful exact ground/harvest sales alone reuse the previous gold icon, flight and verified user-provided WAV. No parallel procedural sale cue; sample readiness never delays the transaction, and mute/hidden/dispose invalidates pending sound. Known-plant maturity context changes are refreshed in the context view only, without HUD/editor/save churn.
