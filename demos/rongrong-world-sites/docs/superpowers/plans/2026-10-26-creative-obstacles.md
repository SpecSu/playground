# Creative obstacle consistency implementation plan

> Native execution by assigned worker; parent authorized this bounded repair.

**Goal:** Ground props/custom eggs share occupancy across navigation and placement without teleporting existing actors.
**Architecture:** Canonical creative assets remain the only ownership truth. A bounded coordinate-only projection is regenerated at read/advance/central commit, copied through existing timelines, and stripped from imports before strict validation. No schema migration, new model, UI or terrain-height work.
**Approaches:** Explicit context on every API is too broad; WeakMap loses data in structuredClone. Choose optional bounded `staticObstacles` projection with exact coordinate validation and authoritative recomputation.

- [x] RED actual pine route and shared egg placement; canonical pickup/hatch/legacy/import/arrival regressions.
- [x] Pure bounded projection and segment/envelope helpers; current-position and reachability placement guard; narrow legacy exit allowance.
- [x] Model navigation/occupancy/arrival and retained-route validation; preserve existing no-obstacle behavior.
- [x] Canonical read/advance/commit and creative self-hatch hooks; import strips only derived projection, fingerprints original.
- [x] Actual World roots stop/replan against new obstacles without position writes/teleport; CPU DOM regression.
- [x] Focused and full tests, typecheck, lint, build; independent review; isolated commit, main integration only.

Review focus: legacy actor inside an old prop exits without deletion; own custom egg can hatch but other blockers cannot be ignored; large arrivals don't intersect adjacent props; new obstacle interrupts future path without snapping actual World positions; no forgery via imported projection or stale stored projection. Preserve concurrent boarding/wishing locks, reserved slots, 15s custom incubation and P0 continuous timeline.

Verification and scope: see `docs/creative-obstacles-verification.md`. Base `144bcabae832b5cbe7ea12a5c5d9ddfacedba8f5`; kept as an isolated branch for main integration, no publication.
