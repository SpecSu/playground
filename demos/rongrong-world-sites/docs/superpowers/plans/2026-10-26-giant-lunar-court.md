# Giant lunar court implementation plan

**Goal:** A genuinely enlarged chicken and floral character, with a matching grounded court and a safe overview; no extra model normalization or economy change.
**Shared contract:** Main owns growth/navigation/World/Scene. This branch owns court geometry, a pure shared layout, scenery's narrow hook and geometry tests. The user opted out of design question gates; the coordinator approved the following measured design.

## Design
Keep original 1× constructor behavior for regression. Production lunar scenery explicitly uses court scale 2, transforming the old stand `(3,1)` to `(3,3.8)`, facing π. This maps the rim to `(3,4.3,-7.5)` and base to `(3,-8.9)`, with its final edge at -9.6 inside the existing -10 floor. The actual chicken uses instance normalization 1.5 once and a separate actor growth 2; its ball is radius .28. Scene supplies real hand and doubled departure/velocity/apex. Court art and authored ball trajectory dimensions share the same single court scale; world-space hand input is never scaled again. Move only the rear decorative crater clear of the enlarged paint.

Measured existing clips: chicken 2× ≈3.005m tall, floral 3× ≈2.851m, other three 1.2× ≈1.14–1.23m. The coordinator subsequently selected floral growth 3, while chicken remains 2. New walk clips require repeat measurement at final integration.

## Tasks
- [ ] RED→GREEN pure layout contract with dry owned placement/circle clearance and fixed court stand/heading/scale/bounds. Hand contract to main early.
- [ ] RED→GREEN court size/grounded support/owned clearance, line normals, budgets and scaled exact ball trajectory; preserve all 1× tests.
- [ ] Production scenery 2× hook and rear crater relocation; actual primitive/GLB support and clearance checks.
- [ ] Actual adult mesh/ball triangle and HUD-safe camera projection checks, with final main Scene walk-to-stand/facing and frozen adult walk inputs when available.
- [ ] Full tests, DOM, type, lint/build; final independent review by coordinator, no publication from this branch.


## Court checkpoint (before integrated navigation/camera)
- Baseline v33: 990/990 ordinary tests passed.
- Layout / old court / adult court / procedural scenery focused: 16/16; actual admitted chicken mesh preflight: 1/1, 375 skin samples, minimum sphere/skin clearance +1.935mm, contact error .111mm, rim error 1.26e-15m, root growth2 + instance1.5 only. This is not the final walking Scene proof.
- Actual World GLB perimeter/obstacle suite: 4/4. The separate existing lunar camera test correctly remains RED until main's World reads the enlarged layout bounds (old view clips the base at x NDC .98946 against .95 threshold). Do not weaken the test.
- Typecheck, full lint and production build exit0 at this checkpoint. Aggregate source pins are main's responsibility.
- Next: main integrates fixed adult geometry, growth, return-to-court/facing and new camera bounds; rerun whole Scene dense ball/skin checks and full UI/World regressions against exact combined source.
- Ordinary checkpoint run: 994/995 passed; only the aggregate pinned-source manifest test is stale. The new actual-mesh test was then run separately and passed. Final combined full-suite verification remains with the main integration (including navigation/camera changes).
