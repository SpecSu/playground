# Fifth sample friend: school playground

User requested a visibly larger school playground with eight red-scarf runners in formation, not floral-vest and not new species/accounts. User previously opted out of question gates; the following defaults are implementation decisions, coordinated with main. This is a separate increment after r4, never part of its frozen package.

## Chosen architecture and alternatives
- Use a dedicated visitor-only SchoolPlaygroundWorld and React view. It receives an opaque verified asset scope but has no MinimalState, account, storage, wallet, outbox or authoritative map. Main agrees this is safer than widening MinimalWorld's formal tile/path assumptions.
- Reuse LunarShowcaseAssetLibrary's single-template parse/cache and SkeletonUtils clones: eight separate skeletons/mixers, shared geometry/textures, cheap per-clone materials. Do not copy eight GLBs or pretend they are eight species or people.
- Do not reuse lunar wandering or multiply old walk speed. A separately reviewed actual run clip is required. Missing/unverified run means explicit unavailable state, no running stand-ins.

## Stage
Actual ground32×24m (old farm20×20m). Capsule centreline has half-straight6m, turn radius6m; track band inner3.9/outer8.1m. Two columns offset±.7m and four rows at2m centreline spacing. Centreline progress and tangent are analytic and wrap continuously. Each lane's actual travelled distance drives its own run phase/stride; columns remain abreast in bends without fake sliding. Small fixed phase offsets only at initialization.

Low-poly school building north, bleachers south, inner field and goals, perimeter fence, shaded rest corner. All real geometry must be supported inside ground bounds and outside the entire runner skin envelope. No terrain or nav change outside this visit. No placeholder humans.

## Interaction and mobile
Observe from sidelines: drag orbit/zoom; choose following the running group (default so mobile runners remain readable) or full-field overview. Clicking a runner selects its numbered instance; a group pause/continue control is allowed. No individual pickup, sell, breeding, ownership, inventory or movement commands. Capability rejection exists in the scene command layer, not just hidden UI. Clear example badge/current location/home remain. Help holds detailed explanation.

## Motion and lifetime
Run spec will come from rig worker: exact clip duration, world stride, foot stance/flight and measured bounds. No admission until real bytes/pose tests. Group tick uses active time only, one world RAF. Hidden/blur/modal pauses and rebases, zero catch-up. Dispose aborts library load; late clones release rather than attach. Home world/camera remains parent-owned and untouched. Switching viewer or sample destroys the playground session.

## Verification
TDD analytic closure/tangent/spacing; geometry bounds/budget/ground and no runner-envelope overlap; eight real cloned skins with one fetch, independent bones/mixers, proper disposal; actual run stance drift, ground/flight, curve contact and loop continuity; actual React lifecycle keyboard/focus/hidden/late promises and no storage/outbox. CPU THREE/GLB only; no GPU/browser visual claims.
