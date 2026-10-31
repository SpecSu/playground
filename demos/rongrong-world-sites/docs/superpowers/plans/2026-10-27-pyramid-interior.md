# Pyramid Interior Implementation Plan

> **For agentic workers:** Implement inline under superpowers:executing-plans; isolated optional feature only.

**Goal:** Enter the uploaded splat interior from the desert pyramid and genuinely walk through a safe central corridor.
**Architecture:** Retained exterior world + lazy modal interior; native Three SPZ loader and GaussianSplat renderer; independent pure motion/follow camera and resource lifecycle.
**Tech Stack:** TypeScript, React, existing Three 0.186.1, node:test.
**Spec:** docs/superpowers/specs/2026-10-27-pyramid-interior-design.md

## Global Constraints
- No main release mutation/deploy, new dependency, paid API, save/economy/account changes.
- No browser automation; preserve actual uploaded splat content and report GPU QA limits.
- No full bonus test/build concurrently with main release.

## Review Focus
- Cancel during dynamic import, renderer init, streamed fetch or synchronous decode completion.
- Repeated enter/exit/retry must not accumulate canvases/listeners/resources.
- Blur/hidden state and pointer cancel must stop walking; no delayed drift.
- Close must retain exterior player/camera and unfreeze original controls only.
- Unsupported GPU/context loss must keep a usable return/retry path.

### Task 1: Verified asset and bounded third-person navigation with actual LX
- Create tests/minimal-pyramid-interior.test.ts: bounds, diagonal normalization, dt cap, look limits, exact SPZ count, resource progress/cancel/late disposal.
- Run focused test RED before implementation.
- Create src/minimal/pyramid-interior-motion.ts and pyramid-interior-asset.ts; copy exact input into public/models/interiors/pyramid.spz.
- Run focused test GREEN.

### Task 2: Lazy renderer and modal entry
- Create DOM fixture tests for resource lifecycle and exterior retention; run RED.
- Create PyramidInteriorWorld.ts, PyramidInterior.tsx and pyramid-interior.css; add exact pyramid mesh picking and narrow visitor entry wiring.
- Run focused tests GREEN and typecheck.

### Task 3: Verify and hand off separately
- Independent review for lifetime/input/state safety; correct important issues with RED/GREEN tests.
- After main clears CPU-intensive work: full tests/build; record verification evidence and limitations.
- Commit clean branch. No merge/deploy; root chooses separate release.
