# Boarding partner cards (separate follow-up)

Parent approved after frozen safety-UX commit 55cf17c. This branch only replaces sender/recipient native selects with two-column native button cards, reusing the existing boarding portrait content, animalPortrait and RarityBadge. No model requests, auth/World/command/economy changes, and no changes to the frozen release input.

RED → GREEN: visible portraits/sex/rarity, aria-pressed single selection, concise disabled reasons, bounded scrolling + touch sizes, no mutation from choosing, both consent points remain separate. Refresh invalidation clears stale selected IDs and only repairs focus if its card was removed/disabled, without stealing a surviving control or nested-help focus. Existing invite/accept/outbox and actual World CPU tests retain behavioral assertions with new card actions.

Verify fresh full ordinary/DOM/P0/type/lint/build and independent review; hand a separate commit to integrator. DOM/CSS contracts are not a browser/GPU visual approval.

Custom-creature presentation: the existing domain remains unsupported for pairing even when adult. Cards reuse the approved creative catalog portrait (unknown templates use the generic paw icon), say 自定义伙伴暂不支持配对, and never present the pig care-rule species as their visual identity. The generic action reason is neutral rather than implying that an adult custom creature is too young.
