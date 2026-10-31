# V29 shop, custom companions and command recovery

Common source: `cb5125cc080dfe4dc76072902db2c88b5cdf93f6`.
Previous Site source: `69952a467a3c9636150da2bb223b6fbbb2c5d07c`.
Named resource configuration SHA256: `94a6ee2595c3ca47b569554b9fda9eeaa49cc4eaccff884026ec40b8f4d27bf9`.

## Hosting and account boundaries
- Keep the same project and existing D1 schema. No migration, data reset or seed is required.
- The Site entry is public; account operations still require the platform-injected signed-in identity. Query names are selectors, not authentication. Each trusted login has a separate demo namespace. Same-name farms belonging to different logins are not shared.
- Keep `FARM_MINIMAL_ONLINE=1`, `FARM_NAMED_DEMO=1`, and `FARM_NAMED_REQUIRE_MODELS=1`. No-name formal account behavior, reserved owner migration and original browser keys remain protected.
- Test links: https://fluffy-farm-companions.tangguozhou.chatgpt.site/?name=twx and https://fluffy-farm-companions.tangguozhou.chatgpt.site/?name=test .
- Visits are read-only overviews and wishing uses atomic exchanges, not realtime co-presence. Local and hosted databases are separate.

## Changes
- All five ecological egg categories stay visible. Actual shared purchase rules drive native disabled buttons, locks, muted cards and concise reasons. Missing hatch terrain is not itself a sales ban. Prices, species probabilities and white/green/blue/purple/gold rarity are unchanged.
- A validated terminal POST acknowledgement unlocks its request without waiting for an optional read. Unknown outcomes retain the exact durable request ID. Fetch and body timeouts are bounded; retries never create replacement purchases.
- Arrival during a pending move keeps its action intent until acknowledgement. Rapid movement input retains only the latest unsubmitted target. Rejection, cancellation, hiding or leaving invalidates deferred actions. Background reads cannot reset an active same-revision walk.
- Wishing failures are not presented as an empty pool, and selection/confirmation focus is restored. Creation lives in the egg shop; the wishing pool only exchanges.
- Fixed-sample custom creatures now have paired, validated lifecycle actors: growth, care, pickup, putdown and normal-value sale. The actual static GLB uses procedural whole-root actions, not new skeletal gait or live generation. Custom terrain generation remains locked; existing land editing remains available.
- Legal v2-only local saves can be copied into the isolated Hunyuan key without writing the original. Invalid/future saves stay protected; diagnostics reveal only source category and format reason. The user's previously reported local incident is not claimed diagnosed or fixed without its raw-source evidence.

## Asset and evidence boundaries
- The four real model/portrait pairs and all 85 pinned static assets remain unchanged; old 35 GLBs are preserved.
- Exact hosted named-demo mapping reuses prior local runtime 8/4 functional evidence, not fabricated hosted receipts. SHA-first browser/model validation remains mandatory; ordinary Sites provider JSONs remain null.
- Public metadata uses opaque audit aliases instead of private filesystem paths. Checked profiles, asset hashes and functional results are unchanged. Alias references are not public files or new measurements. Private originals and the mapping are not packaged in this Site.
- Browser visual acceptance and mobile GPU/FPS remain unmeasured. Native publication is not an HTTP or signed-in browser acceptance test.

## Verification and rollback
- Final common affected regression: 294/294 passed; typecheck and changed-file lint passed.
- Independent custom lifecycle review: 79/79, including actual CPU World projection and SQLite fault rollback. Additional App care/pickup/putdown/sale test passed.
- Independent P0 review: 18 client/clock checks and 10 actual UI/SQLite checks passed. Combined in-tree P0 tests: 27/27 passed.
- Official Site typecheck and official build passed. Source-sync manifest covers 127 exact source files. Final Site test results are recorded in the accompanying handoff, separately from the common regression.
- Do not clear D1, pending outboxes or browser saves to recover connectivity. Existing unknown commands must be retried with their original ID.
- After new custom companions have been created, the old Site's lifecycle logic is not a safe business-level rollback target: retain/snapshot D1 and prefer a compatible forward fix. Never restore an old database over newer progress.
- This cloud release does not automatically update an offline local installation. A separately verified local artifact is required.
