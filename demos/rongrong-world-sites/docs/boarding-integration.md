# Real-account boarding integration handoff

Base: `493f6e9d0e9ecbe7b5111d4202cf9ae97d6f1c3b`.
Pure contracts: `a61976cfa835f84c52ffb024510686c853d525f6` (already shared with sample showcase owner).

## Runtime entry points
- `GET /api/minimal/boarding`: participant-filtered invitations only.
- `POST /api/minimal/boarding-command`: ordinary durable request `{requestId,expectedRevision,command}`; accepts invite / accept / cancel. Actor comes only from the trusted Sites subject, never body or friend code.
- `AccountClient.boarding(command)` uses the existing UID-scoped outbox; `boardings()` validates the narrow response. All P0 clock/position methods are untouched in this branch.
- `<BoardingPanel client={session} onClose={...}/>` is standalone. Main UI owner must expose it through the friends/boarding entry; this branch intentionally does not edit MinimalApp or World.
- Named demos are explicitly rejected before their repository is opened. Panel explains the distinction and links to `/` without migrating/resetting saves.

## Shared-file merge points
1. `CanonicalFarm`: optional activeBoardingId, boardingAnimalId, boardingReservedEgg, boardingInbox.
2. `MinimalRows.boardings` and `MinimalResult.boarding` (public projection, never storage row).
3. Authority execute/get settle due records within the existing transaction; command/wishing lock guards, creative occupancy guard, boarding entry/list methods.
4. This branch was based before P0 `canonical-timeline.ts`. Retain P0 and pass the combined wishing + boarding animal IDs through shared projector, presentation timeline, and every App prediction path. The main integrator has already implemented backward-compatible multi-lock support.
5. `BoardingHelpers.resources` currently uses `ApprovedDemoResourceContext`, matching the base. Main integration changes this along with MinimalAuthorityOptions to the approved signed-in/demo union. Do not weaken resource validation.
6. Refresh `docs/sites-named-demo-source-sync.json` hashes after semantic merging; its candidateCommit still documents the original import, not this feature.

## Capacity details
Reserve one ordinary animal/egg slot for the initiator throughout active boarding, regardless of private draw outcome. Ordinary purchase/emergency egg and unrelated ordinary breeding cannot consume the last slot (including midnight).
Creative paths consume a slot only for `place` of a custom-creature or `hatch` of a ground custom-egg whose approved catalog template is creature. Legacy bag hatches, claims, props and ordinary egg→animal hatches stay allowed. The latter is net-zero occupancy. Wishing cannot overlap an active boarding, so incoming exchange cannot consume the slot through a previously open offer.

Local combined execution with the paid custom-egg branch `3eda17d` verified both new paid ground creature and prop hatches: creature is blocked at 15; prop succeeds; each boarding still settles into slot 16 and rewards 5 exactly once. The main integrated tree should retain these cases in its combined acceptance checks.

## Persistence/publication
Apply `drizzle/0003_giant_proudstar.sql` via the normal migration-owned publication path. It adds only `minimal_boardings` with JSON validity. No old table/row is removed or reset. Runtime never creates schema and fails closed if it is missing. Updated `server/minimal-schema.sql` is for local fixtures.

## Verification and limits
- Focused real domain, SQLite-backed D1, protected API, durable outbox, friend-code/candidate tests: `node --experimental-strip-types --test tests/minimal-boarding*.test.ts`.
- CPU DOM: `node --import <local-happy-dom-resolver> --import ./tests/view-loader.mjs --experimental-strip-types --test tests/minimal-boarding-panel.dom.mjs`.
- Aggregate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- No browser/WebGL visual review, hosted HTTP, live account invitations, production mutations, or deployment were performed. Local passing checks are not online acceptance.
- Sample boarding is a separate, explicitly non-transferable adapter contract, not a production identity alias. Its implementation belongs to the showcase task.
