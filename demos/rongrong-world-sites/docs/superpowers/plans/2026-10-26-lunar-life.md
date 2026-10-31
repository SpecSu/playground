# Lunar Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Make the five lunar DIY companions genuinely roam, repeat contextual actions and grow within their isolated sample visit.
**Architecture:** Pure bounded life/path/growth helpers drive the existing verified Scene clock and aggregate-pose mixer. World supplies terrain/obstacle clearance; final authored walk clips supply stride. No domain account writes.
**Tech Stack:** TypeScript, Three.js, Node test, CPU React/World harness.
**Spec:** ../specs/2026-10-26-lunar-life-design.md

## Global Constraints
- Exact five identities; no old20 assets, new auth/economy/schema/dependency scope.
- Child rig translation/scales fixed; adult normalized stride is measured, not guessed.
- No hidden catch-up, teleports or invisible ball steps; no browser/GPU claim.
- Sample age/care is explicit reset-on-leave, not formal owned raising.

## Review Focus
- A dynamic player blocks a valid path after planning; actor stops without penetration.
- Rapid manual actions/carry interrupt walk and target poses still converge.
- Giant growth cannot outgrow reserved ground/actor clearance.
- Chicken away from court queues return/alignment instead of shooting randomly.
- Hidden/modal time freezes all life state, including age/care cooldowns.

### Task 1: Pure life, path and growth
- [ ] Write failing bounded path, recurring schedule, pause, phase/distance and real growth/care tests.
- [ ] Implement `lunar-showcase-life.ts` and `lunar-showcase-path.ts` using ordinary growth math.
- [ ] Run focused tests and commit.

### Task 2: Scene/World integration
- [ ] Add failing synthetic Scene movement/pause/carry/manual/court tests and walk validation tests.
- [ ] Add optional measured walk contract, distance-driven timeline, full-footprint World query and local Scene life state.
- [ ] Keep actual aggregate-pose and scope tests green; commit.

### Task 3: Final authored assets, giants and presentation
- [ ] Independently validate exact new walk GLBs and measured profiles before catalog replacement.
- [ ] Integrate growth-aware court only from court owner, measure body/ball/terrain/HUD contracts.
- [ ] Show life/growth/care status and truthful sample reset boundary; actual World/UI tests.

### Task 4: Final verification/review/source
- [ ] Full ordinary/DOM/type/explicit lint/build, pin hashes and unchanged old assets/migrations.
- [ ] Independent combined review, targeted fixes, frozen official source preparation only; root publishes.
