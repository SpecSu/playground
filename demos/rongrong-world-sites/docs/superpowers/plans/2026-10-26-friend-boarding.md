# Friend Boarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Real authenticated friends can explicitly consent to a short, ownership-preserving pairing.
**Architecture:** An independent boarding domain delegates all writes to the existing MinimalAuthority transaction and D1 global CAS. The API and panel expose only participant-specific summaries.
**Tech Stack:** TypeScript, React, Node tests, SQLite-backed D1 contract tests.
**Spec:** `docs/superpowers/specs/2026-10-26-friend-boarding-design.md`

## Global Constraints
- No name-to-production mapping; no weakened authentication or real-user mutation testing.
- 10 minute pending invitation, 5 minute boarding, one egg maximum, 5 ordinary helper coins only on successful completion.
- Existing 35% breeding chance and per-animal/day + successful-farm/day caps; no rarity inheritance.
- No ownership transfer, new payments/chat/generation APIs, or World/position changes.

## Review Focus
- Cancellation racing maturity must leave exactly one terminal state/reward.
- Reused request IDs and unknown responses must not mint twice.
- Recipient pending invitations must not lock an unconsenting farm.
- Clock regression and midnight must not restore consumed attempts.
- Counterparty private snapshots must never appear in API/receipts.

### Task 1: Atomic boarding and canonical locks
Files: create `src/minimal/boarding-contract.ts`, `boarding-authority.ts`, `tests/minimal-boarding.test.ts`; modify `cloud-contract.ts`, `authority.ts`, `server/minimal-d1.ts`, `server/minimal-schema.sql`, `db/schema.ts`, additive drizzle migration.
Interfaces: `applyBoarding(tx, farm, now, request, helpers) -> MinimalResult`; `settleBoardingForFarm(tx, farm, now, helpers)`; `boardingLockedAnimalId(tx, farm) -> string|null`; `boardingList(actor) -> BoardingPage`.
- [x] Write failing acceptance/identity/receipt/settlement tests, run to confirm absence.
- [x] Add minimal domain, authority entry points, reservation guards, persistence.
- [x] Run targeted tests; add and fix terminal/race/midnight/privacy regressions.
- [x] Verify D1 concurrent writers/rollback and additive schema behavior; commit.

### Task 2: Protected API and UI
Files: modify `server/minimal-api.ts`; create `src/minimal/BoardingPanel.tsx`, client contract/tests. Shared `account-client.ts` and `MinimalApp.tsx` wiring is delivered as coordinated minimal hunks, not competing whole-file edits.
Interfaces: authenticated GET `boarding`; POST `boarding-command` returning normal MinimalResult + participant projection; `BoardingPanel` receives authenticated client and close callback.
- [x] Write failing auth/demo/projection tests and panel/client interaction tests.
- [x] Implement routing, durable request handling, friend-code copy/paste, parent previews, fixed-term consent and explainable demo-to-production navigation.
- [x] Run focused tests, full `npm test`, typecheck, lint, build. Report exact limitations and integration handoff.

## Verification ledger
- Baseline `npm test`: 787/787. Final isolated branch suite: 819/819, 0 skipped/failures.
- Real boarding focused tests: 32/32. CPU Happy DOM panel tests: 5/5. Typecheck, lint, production build and diff whitespace check all passed.
- Red→green defects discovered and fixed: cross-account late panel response; crossing-midnight ordinary breed stealing reserved egg slot; overly broad creative guard blocking net-zero bag hatch/prop placement.
- Independent read-only reviewer found no blocking defect after fixes; additionally injected real SQLite D1 terminal-row failure and verified full rollback plus one-time recovery.
- Ruling: use per-account single active/outgoing slot, not multiple per-animal sessions — conservative first-release lock safety approved by parent.
- Ruling: signed-in 20-species resource admission, canonical multi-lock projection, app entry, and sample adapter implementation remain main/showcase integration owners; no duplicate edits here.
- No hosted mutation, visual browser review, live account invitation or publication.
