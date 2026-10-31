# Friend boarding (first release)

## Intent and constraints
Give owners of a rare adult a consent-based way to breed with a real friend's opposite-sex adult without transferring either animal. This is not a real-time shared world. Existing ordinary breeding is 35% success, each animal attempts once per UTC+8 day, each recipient farm produces at most one successful egg that day. Egg rarity is still independent (including 1% gold); no genetics or gold-parent guarantee.

Only verified production account UIDs may participate. A friend code encodes the full existing UID; it is an identifier, never proof of identity. `?name=` test namespaces cannot participate or be translated into production users. Show why and offer the explicit production entry. No profile listing or private farm read endpoint is added.

## Approaches and choice
- Transfer animals between canonical farms: rejected because disconnects/returns and capacity create unnecessary ownership risk.
- Shared live 3D farm: deferred; much wider than breeding consent.
- Chosen: immutable original ownership, server-side reservations, narrow parent summaries in a boarding panel. This uses the existing global D1 CAS and receipts across both production accounts.

The user opted out of further questions. Durations and economy below are conservative implementation defaults, approved by the coordinating task.

## State, ownership, timing and rewards
`pending -> active -> completed | failed`; pending may be `canceled | expired`; active may be `canceled`. Invite expires in 10 minutes. Confirmed boarding lasts 5 minutes. Both named participants may cancel. One pending outgoing/active boarding per account; incoming invitations do not lock recipients before consent. At most 20 recent inbox records per farm, pruning terminal entries rather than creating an unbounded scan.

Inviter chooses its own adult and exact friend's UID; recipient explicitly chooses its own adult. Animals must be ordinary, live, not carried/suspended/exchanged, same species, opposite sex and adult according to the existing model. No new genotype assumptions. Their IDs and provenance never change and their canonical records remain in their owner's farm.

Acceptance consumes both animals' daily attempts and performs exactly one existing-model breeding draw atomically. A potential egg is stored only in the invitation row until completion; it is never projected early. On success, the inviter's successful-egg day is reserved immediately, avoiding rerolls by cancellation. Canceling after acceptance does not restore attempts or that reservation. Success releases one egg to the inviter's bag and gives the helper 5 ordinary coins exactly once. Failure/cancel/timeout give neither egg nor coins. Capacity is reserved for one egg while active: ordinary purchases and additional ordinary breeding cannot consume the final slot, including across midnight. Only creative operations actually adding a ground animal consume a slot; bag hatches, prop outputs/placement, claims and ordinary egg-to-animal hatches are net-zero and stay allowed. Pending expiry does not consume attempts.

Server time and reads/commands settle due transactions; browser timers merely refresh. Completion and cancellation race under the same global CAS. Animal reservations exclude sale, exchange, carry, and another pairing; unrelated farm actions continue. No externally generated assets, payment, chat or real-user test mutations.

## Privacy and persistence
Add one schema-only `minimal_boardings` JSON table. Existing farms gain optional `activeBoardingId` and a bounded `boardingInbox` index; old farms need no reset or wholesale migration. Stored invitation has private pending result, but API returns only both participant UIDs, fixed terms, state/timestamps, and names/species/sex/rarity of the two selected parents. It never returns the counterparty's farm, coins, inventory, player position, prompts, or subject. Request actor always comes from the trusted hosting adapter.

## Verification
Red/green tests: real-UID auth and named-demo rejection; forged participants/targets; consent and maturity/species/sex; one-time rewards/receipt replay; cancellation and both timeout races; ordinary sale/exchange/breed locks; no ownership movement; failure unlock; no reroll/cancellation refunds; projection privacy; SQLite-backed D1 CAS rollback/races and additive migration preservation. UI tests cover disclosure, explicit accept/cancel, unknown-outcome retry, identity change/disposal, and demo-to-production link. No hosted or real-user mutation testing.

## Integration boundary
The separate user-requested sample-friend showcase uses `BoardingTarget` and `SampleBoardingAdapter` from `boarding-target.ts`, not real-account writes. These interfaces intentionally return non-transferable demo snapshots instead of CanonicalFarm/MinimalResult. Its adapter and World visitor UI are a separate owner/task. The app panel entry, newer canonical timeline multi-lock wiring, and signed-in 20-species resource capability are integrated by the main task; this isolated branch does not modify World or MinimalApp.
