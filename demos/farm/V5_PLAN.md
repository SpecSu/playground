# V5 implementation plan and acceptance ledger

Baseline: clean codex/animal-farm-companion-demo at8d4cdc2, same Mac worktree and5190. No AGENTS.md or .agents/skills found in checkout/parent. Full authorized V5 reference fetched read-only from Notion and saved in docs/V5-reference.md (33,501 characters); the delegated excerpt had omitted middle sections, now recovered.

## Product and data decisions

- Keep390×844 PhoneViewport, original feed typography/icons/dock/sheets and LX. No dashboard, Sites, originalGitHub push, external credential access or browser automation beyond independent Chrome.
- Existing legacy farm identity/animals/relations/appearances/wool are retained. New versioned estate state lives beside legacy records; current V5 API exclusively settles the new world. Old protocol may remain as tested compatibility utilities but cannot be used through current API to bypass V5 care/growth/finances. Migration backup precedes service update.
- One authoritative navigation grid for LX/animals/building validation/evacuation. Initial12×12 owned cells, four connected regions; water forbidden to sheep/LX unless appropriate legal component. Expansion adds adjacent6×6 rather than another room.
- Online pulse capped per request, hidden/offline pauses threat/build/rescue. Real time only governs age and bounded offline production/needs. Demo240× accelerates age only: documented6/18minutes are age gates, not a promise that30-minute care milestones can also finish in24minutes.
- Natural profile is always reassuring. Lab profile is a separate fresh demo population/inventory/workspace; no natural pets/rewards move there. Only explicit lab challenge confirmation enables permanent-loss memorial outcomes.
- All numeric parameters editable constants. Counts come from actor/path/queue simulation, never hardcoded6/4/3 results. Exact document examples are benchmark assumptions and are tested separately from live small-map results.
- No evidence yet of an authorized AI provider or stable friend/account/permissions backend; audit source without opening secrets. If absent: explicit template themes, local demo visitor/proposals and private work records; external integration contracts documented, no fake AI prompt mapping.

## Tasks / isolated ownership

1. **Spatial module** src/v5/layout.ts + tests/v5-layout.test.ts: initialworld, regions/terrain, cardinal legal edges, pathfinding/LOS, footprints/doors/capacity, building prices/paid-cost ledger, reversible preview, single online construction slot, expansion/survey. Exports GridPoint/Building/Layout, createLayout, findPath, lineOfSight, isWalkable, regionAt, validateLayout, previewEdit, commitEdit, tickConstruction, cancelConstruction. Materials passed explicitly; no database or UI ownership.
2. **Life module** src/v5/life.ts + tests/v5-life.test.ts: needs, baby→juvenile→adult real-time gates, effective feeding/food compatibility/full check, rest/explore/play/session milestones, daily relationship budget, habits across sessions/days, bounded adult products. Exports LifeState/createLife/settleOffline/advanceLife/feedingResult/growthSummary/playWith/animalScale; no world or DB mutation.
3. **Threat/guardian module** src/v5/threat.ts + tests/v5-threat.test.ts: one selected guardian, actual path/LOS discovery, reachable skills with cooldown/cast limits, shelter reservation/sharedcapacity/door queues, wolf approach/visible attack/grab/rescue chain, rehearsal/reassuring/lab-only challenge, pause/resume and peranimal telemetry. Exports GuardianKind/ThreatState/createThreat/stepThreat/guardianCommand/threatSummary/evaluateEvacuation; consumes same layout graph, actor counts dynamic.
4. **Creation/local-social module** src/v5/creation.ts + tests/v5-creation.test.ts and INTEGRATION.md: source audit, explicit safe templates/versioned drafts/proposals/works, restricted local example visit, owner opt-in/accept/revoke, help2/day limit and48h expiry, blueprint base-version/budget/undo/refund protection and attribution. Functions return proposals/effects for rule engine; no remote calls or pretending local actors are real friends.
5. **Root integration** src/v5/estate.ts, server/store.ts/index.ts: versioned profile state+legacy migration, transactions/receipts, strict V5 command validation, movement and delayed-care jobs (reserve→walk→3s→deduct once), manual cancellation/target switch, bounded pulse/session IDs and interrupted restoration, resource finance/build/creation/adoption<=12demo only. One currentSnapshot canonical state.
6. **Playable world/UI** src/v5/EstateWorld.ts/EstateApp.tsx/EstateView.tsx and scene helpers: four-region continuous3D, baby body stages fromactualLife, threeguardian models/skills/threat paths, camera followsLX, legal build ghost/map overlay, animal card primaryfeeding +2secondary, workbench/food routing/rest/explore/recommended preview/comparison, reassuring/lab confirmations, template/blueprint/privateworks/localvisitor sheets. Reuse original feed modules rather than recreate shell.
7. **Verification/deployment**: unit/property fixtures for clocks/navigation/costs/migration/idempotency/late requests/capacity; actual built-entry DOM+HTTP isolatedDB completechain. Full lint/typecheck/tests/build; fresh review/fix; consistent SQLite backup, update onlyowned local service at5190, detached background and cross-turn health. Browser/WebGL remains unverified if no independentChrome tool.

## Shared module contracts

- GridPoint={x:number,z:number}; cells are integer centres, continuous positions use same units. Default grid coordinates0..11 map to Three world by subtracting5.5. Region IDs pen/meadow/shore/home; expansion east12..17,z0..5.
- Modules own only files in their task above; root owns estate/API/UI. Agree exact exported signatures in a module header and report them promptly. Agent changes in shared checkout are immediately visible; no edits to legacy core/UI files by module workers.
- Tests run Node24 via demos/farm/.local/runtime/node (PATH="$PWD/.local/runtime:$PATH"). Existing45 legacy tests remain named compatibility/regression evidence; new current-world API/DOM acceptance is separate, not replaced by those tests.

## Acceptance chain

- [x] Existing save migrates without identity/relation loss; newLX/babies/safe6capacity shelter/trough/workbench,60materials/6food/3carry.
- [x] Tutorial selection freezes danger; dog/cat/frog produce distinct actual effects, all tutorial choices safe.
- [x] Card shows stage/H/E/growthmissing/realmemory; feed autowalks legalpath, cancels onmove/targetswitch,3s once, wrong/full/blocked no deduction.
- [x] Four continuous regions traversable withfollowcamera; water/barriers respected;30s exploration and60s safe rest counted online.
- [x] Layout ghost/footprint/budget/routes/capacity preview; confirm starts one timed construction, cancel/demolish/undo never overrefund; eventlocks edits.
- [x] Animals reserve finite shelter slots, follow actual routes, queue at realdoors; addingdoor does not addcapacity; seventh actor cannot claim seventh ofsix slots.
- [x] Rehearsal peranimal facts andlegalrecommendation explainroutes/queues; reminders do notspend/build/publish. Automaticbudgetedhusbandry remainsunimplemented.
- [x] Natural animals never permanentlylost; lab only explicitparticipantchallenge, rescue180online pausedoffline and event/rewards not reset byrefresh.
- [x] Template visible scene→preview→apply→undo; privateworks fact-sourced; localvisitor/proposal labeled demo; staleversion/outofscope/revoked/duplicateaccepted rejected.
- [x] Save/revisit preservespositions/jobs/events/layouts/work; natural24h+72h growth genuine, demo separation and offlinecaps tested.
- [x] Full currentAPI/DOM tests, lint/typecheck/build:198/198 tests pass; HTTP23resources andactualbuiltReactentryNodeDOM pass.
- [x] InstalltestedV5atMac5190:oneauthorization-evidenceretryaccepted; PID42322PPID1, all23resourcesbyte-match, old7farmrecordsunchanged, healthidentitymigrationpasses.
- [ ] RealChrome/WebGL:independentChromeentryunavailable; nobypass.

## Progress

- Audit: checkoutclean at8d4cdc2; fullV5 recovered; exactdog/cat/frog assets present. Implementation starting; no service/storage changed yet.
- Checkpoint: old5190 PID85673 confirmed alive after19hours, PPID1 loopback-only HTTP200; still serving oldstablebuild. SQLite untouched byV5server (all new tests in/tmp).
- Life20/20 +layout15/15 focusedtests pass. Estate/store first8 integrationtests pass (migration, singlefeedreservation/cancel/3sonline, stale-sessionpause, labisolation, SQLite reopenreceipt, invalidclock). Laterrootregressions forownerpermission/eventegress/onlineguardianswitch nowpass; moreintegrationpending.
- Implemented new EstateStore separateestates/estate_commands tables; legacyfarmrowsreadonly. EstateApp currententry now targets/api/estate; oldwriteinterface retired innewserver. Source changes notyetbuilt/restarted into5190.
- Continuousworld/UI and creationeffectintegration inprogress. NoChromeentryavailable; visual/WebGL acceptance remainsunverified.

- Finalcheckpoint:per-troughcapacity/delivery/refill,foodconservation,factorypartialtime,peacefulguardianlegalmovement and12actorcapacityregressionspassed. Final198tests/lint/typecheck/build/HTTP/DOM green. SQLiteconsistentbackupdone; actualMac5190installationblockedbyautomaticapproval, asdocumentedinVERIFICATION.md. Original7farmrecordsunchanged, noV5tableinuserDB.

- Resolvedrollout:parentprovidednewexplicitMacdeploymenthistory; theoneallowedretryofsameoperation succeeded. Freshconsistentbackup12:19:53UTC; testedbuildnowon5190, PID42322PPID1. Cross-calllivecheckV5API/resources/migration/integritypasses. NoSites/push/networkexposure/securitysettingchanges.
