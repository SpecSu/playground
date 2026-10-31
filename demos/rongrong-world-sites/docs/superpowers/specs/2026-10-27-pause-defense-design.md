# Pause current farm defense gameplay

## Intent and scope
Pause the current Minimal farm's sword-and-shield dog, guardian actions, wolf events, alerts and tension/recovery audio. This is a reversible pause, not a destructive save migration. User wording for custom creatures becomes 小伙伴; ordinary animal/egg terminology and API field names stay unchanged. No new DIY, adoption or generated-content promises.

## Observed architecture
The default entry is FarmEntry → MinimalApp → model/World. The same model and canonical timeline serve authenticated MinimalAuthority, local Node and client presentation. Minimal wolves are cosmetic: there is no damage, battle reward or guardian-choice lock in this mode. Parent confirmed that those mechanisms exist in the separate archived estate/convoy modes, outside this bounded increment.

## Approaches
- UI-only hiding is unsafe: simulation, sounds and command replay would continue.
- Delete fields/assets and reject legacy syntax is unsafe: saved events and pending requests would be lost or locked.
- Approved approach: one internal pause policy used by simulation and presentation. Keep old fields, parsers, command types and immutable receipt lookup; recognized disabled commands finish with existing `model-rejected` receipts. No auth, schema, IDs or protocol changes.

## Contracts
- Preserve guardian, wolfEvent, nextWolfAt exactly on existing saves. No spawn, completion, warning, currency change or damage from a dormant event. Normal growth, care and commerce continue.
- No guardian model allocation, scene entity, collision/avoidance shadow or wolf entity in current gameplay. Historic assets and unreachable enabled-path code may remain for recovery.
- Existing receipts are returned before current policy, so retries neither re-execute nor charge. Unexecuted guardian/wolf/help requests receive terminal rejection and clear the outbox through the existing client contract.
- Retain invalid-save refusal and original auth/account namespaces. Never access real user data.
- Files owned: new minimal defense policy; model.ts, canonical-timeline.ts, audio.ts, World.ts, MinimalApp.tsx, CreativeStudio.tsx, creative-authority.ts; custom-label-only changes in ExchangeAssetCard, exchange-authority, ConnectedWishingPool, BoardingAnimalCards, boarding-ui, NamedDemoTools and authority; relevant tests and this documentation. No school/friend/visitor files, source pins, package scripts, deployment or browser automation.

## Review ruling
Independent review found no core model, receipt, scene or auth issue. It did find old settings help promising wolf tension music; this was treated as a user-visible contradiction, fixed behind the same policy and verified with an actual settings/help DOM red→green case. The archived mode code is intentionally retained, not silently treated as a missing removal.

A custom-model pending hint in `VisitorFarm.tsx` remains assigned to the school integrator: change only `未用其他动物代替` to `未用其他小伙伴代替` when integrating this increment after the frozen school release. This branch does not edit that frozen owner file.
