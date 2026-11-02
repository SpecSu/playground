# Idle/approach integration plan

> Inline execution with TDD; parent owns independent review and nativeQA/publication.

**Goal:** Owner-first approach/facing and save-free local idle life, plus latest three-entry navigation and approved decorative loading helper.
**Architecture:** Transient scene controller +existing completed-terrain walker. App supplies eligibility/owner input and only handles real post-arrival control callbacks. No reducer/storage changes.
**Spec:** docs/superpowers/specs/2026-10-26-idle-approach.md

1. [x] RED navigation markup/controller tests; implement three-entry dock, fixed seed/build creation rails outside scrolling content, shopaliases and preferred groundtile. Pin separately.
2. [x] RED pure activity/approach tests: exact10s, pause/preempt, nonrepeat/cooldowns, safe targets, stale pending release/arrival. Add walker.face +transient controller.
3. [x] RED actualscene/controller tests: no far events, held-only freshstart, releasedready, supersededtarget cancellation, nonsnapping UIinterrupt, staticcontextidle and zero save/economy changes. Wire scene/app with input-level eligibility and Canvas speech/cosmetics.
4. [x] Integrate approved placeholder/reveal with real geometry unchanged. Fulltests/check/build/diff, immutablepinreview, freeze. No deployment by implementer.

Observed integration fix: accumulated fractional route-duration sums could leave a terminal route marked moving by~1e-13ms. Dedicated RED case failed; a1e-7ms completion comparison tolerance fixes arrival without changing visible380ms timing. Owner pointer preemption registers in capture phase so it cannot cancel the newly created Canvas request on bubble.
