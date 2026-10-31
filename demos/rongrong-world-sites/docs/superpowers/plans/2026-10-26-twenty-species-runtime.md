# Twenty-species runtime implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admit up to 20 independently identified existing animal species to the normal farm lifecycle, only when their real candidate assets pass validation.

**Architecture:** Keep the five legacy species and the two verified Hunyuan providers unchanged. Add a distinct extension path with immutable candidate identities and measured profiles; never use a gameplay profile as a substitute for resource admission. Loading remains demand-driven and bounded rather than fetching the complete catalog at startup.

**Tech Stack:** TypeScript, Three.js, React, existing Node test runner and Sites Worker authority.

**Spec:** Parent task handoff and `docs/named-demo-release.md`; the user explicitly opted out of design questions and asked for cloud execution.

## Global constraints

- Target 20 real distinct species, not 20 renamed or recolored copies; inventory sufficiency remains unproven.
- No paid model generation, no fake receipts or relaxed gates.
- Preserve existing UID/demo/public-subject namespaces, save keys, migration protection, slow acknowledgement/idempotency and deferred arrival actions.
- Keep individual rarity 55/25/13/6/1; no new species rarity or genetic claims.
- Capacity stays 16 concurrent animals/eggs unless an independent product request authorizes change; catalog size is separate.
- No browser, headless/CUA, hosted HTTP retry, or Mac access in this worker. Root owns publication.

## Review focus

- Catalog entries without verified bytes cannot become buyable or active actors.
- Duplicate/reentrant loads must not amplify simultaneous fetch/decode or retries.
- Old v2/v3 identities and unknown/future protected saves retain previous behavior.
- New species cannot fall through existing ternaries into alpaca/penguin dimensions or assets.
- Loading failure must preserve ownership, safe suspension and explicit retry, not fabricate a fallback animal.

## Task 1: Bound demand-driven loading

**Files:** Modify `src/minimal/animal-assets.ts`; create `src/minimal/animal-model-load-budget.ts` and `tests/minimal-animal-load-budget.test.ts`.
**Interfaces:** `AnimalModelLoadBudget.run<T>(load: () => Promise<T>): Promise<T>`; default two active decode/load jobs. Existing `AnimalAssetLibrary` public APIs unchanged.

- [x] Add tests that submit five real species and observe only two simultaneous loaders, then all complete without changing species or shared-template identities.
- [x] Run tests against current code and observe the expected concurrency failure.
- [x] Add a FIFO job limiter, retain failed-template eviction, and share it across legacy/new provider load paths.
- [x] Verify retry and synchronous/async failure release slots; run existing animal/lifecycle/preload tests.
- [x] Commit the isolated common extension.

## Task 2: Candidate registry and species lifecycle

**Files:** Candidate files will be fixed after actual inventory evidence; primary integration points are `species.ts`, `animal-resource-context.ts`, `animal-assets.ts`, `animal-art.ts`, `animal-motion.ts`, `interaction-motion.ts`, `egg-catalog.ts`, `model.ts`, `animal-atlas.ts`, `NamedDemoTools.tsx`, and `World.ts`.
**Interfaces:** Separate immutable save identity, content availability and actual runtime readiness; extension resource descriptors must carry species, actual SHA/bytes, authored bone names and measured motion/placement profile.

- [ ] Audit independent candidate hashes, GLB geometry/skins/animations and metadata before selecting the extension list.
- [ ] Pin tests for unavailable candidates, exact admitted ecological pools, full lifecycle, save/collection and atomic exchange.
- [ ] Implement only candidates whose actual asset gates pass; preserve old species/provider decisions exactly.
- [ ] Verify actual skeletal pose/ground/picking/care/carry/sale and growth-scale behavior. An incomplete candidate remains unavailable.

## Task 3: Release evidence

- [ ] Run full `npm test`, typecheck, full lint and build against final integration.
- [ ] Obtain independent review and address verified findings.
- [ ] Report exact playable count, bytes/compression, blockers and unmeasured GPU/browser limits. Root performs source-helper publication and local same-source delivery.

## Initial mobile budget proposal

This is an engineering target, not a measured device guarantee: at most two active animal fetch/decode jobs, no catalog-wide eager GLB preload, one immutable template per encountered species and cloned bones/materials per actor. Prefer <=3 MiB compressed GLB and <=1024 px texture edges per newly promoted species, with <=8 MiB decoded RGBA texture storage per species. Existing approved assets are not silently rejected by new budgets. GPU/FPS and total resident-memory limits require separate device measurement before stronger claims.

## Initial integration ruling — 2026-10-26

The parent prioritized a new P0 player/custom-companion teleport report. At that initial stage, no changes to World, canonical-presentation, account-client or MinimalApp were included; P0 is owned by a separate worker. Species admission is staged pending seven existing Hunyuan rigs (including parrot) and visual/runtime checks for six lab candidates: dog, fox, hedgehog, lion, tiger, raccoon. Wolf is excluded to avoid confusion with the enemy. `docs/twenty-species-asset-delivery-contract.md` defines the producer/consumer handoff without granting admission. Task 1 is independently verified; Tasks 2–3 remain open for the later release.

## Active follow-on phase

P0 `d5decf5` is preserved in the integrated branch. Paid custom-egg lifecycle, trusted real-account boarding, isolated sample visitor components and explicit signed-in resource usage are integrated as a separate candidate; the parent controls publication. New-species admission remains independent of these features.

- Additional provider/domain/lifecycle owner: friend-boarding implementer, in an isolated `additional-species` worktree. Keep existing seven implementations and receipt schemas unchanged.
- Actual candidate/runtime acceptance owner: custom-egg implementer, in an isolated `group-a-runtime` worktree. Three real Hunyuan candidates (bear, capybara, cat) are materialized privately with all package hashes checked; `ready=false` and water reach unmeasured remain in force. No Mac provenance paths are copied to public resources.
- Remaining real Hunyuan candidates await transfer; six existing authored Blender prototypes await profile/runtime/visual gates. Known identities or a passing static skin audit do not count as playable species.
- Integrator retains source-sync, P0 regression, shared ownership coordination and final evidence. Prop navigation collision remains an explicitly recorded separate unfinished terrain task.
