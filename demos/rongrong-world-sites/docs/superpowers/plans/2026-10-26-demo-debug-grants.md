# Demo-only debug coin grants

> **For agentic workers:** Use superpowers:executing-plans. User opted out of design questions; root approved the bounded contract before implementation.

**Goal:** Settings offers +10,000 / +50,000 virtual coins for demonstration, never for formal accounts.

**Architecture:** Keep the existing named-demo subject/instance partition and D1 namespace. Reuse command receipts and AccountClient outbox; do not add a route, table, client-side mint, offline command, or special `twx` privilege. The API supplies an actor-bound server option only after verified demo routing; Authority validates that binding and an exact two-value command before crediting.

**Constraints:** Existing coin schema accepts finite nonnegative values; debug grants additionally require safe integers and a resulting balance <= 1,000,000,000. The two allowed amounts are 10,000 and 50,000. This is an implementation safety bound, not a real currency or economic entitlement. Production auth, import rules, model gates, and namespace keys are unchanged. The retained standalone server has no minimal/demo route, so it receives no offline fallback or grant controls.

## Tasks and verification
- [x] RED: actual Sites adapter + SQLite/D1 tests for allowed credits, exact receipt replay, altered amount reuse, stale revision, malformed amount/body, final-row rollback, formal/spoof/disabled/wrong-origin rejection, and demo versus formal/other-subject wishing pools.
- [x] GREEN: cloud-contract command type and server-owned actor binding; Authority narrow handling; minimal-api constructs binding from its trusted demo identity, overriding any unrelated context option.
- [x] RED/GREEN: actual AccountClient lost ACK/reload and newer-state replay tests; settings controls with busy/pending/retry and account change isolation. No optimistic coin increment.
- [x] Run complete ordinary and DOM suites, typecheck, explicit `--no-ignore` source lint, production build. Recompute changed source pins only after source freezes.
- [x] Unique independent combined review with sample-roster patch; source preparation/publication remain the separate deployment handoff.

## Review focus
1. Request JSON/query/header cannot grant server authority or select a raw namespace.
2. An HTTP read is not an ACK; only validated terminal receipt clears the durable request.
3. Same ID with changed amount rejects, and old receipt cannot revert a newer canonical revision.
4. Atomic SQL failure rolls back balance, revision, receipt and transaction gate together.
5. Formal local settings and visitors never display mint controls; switching accounts does not leak stale UI outcomes.
