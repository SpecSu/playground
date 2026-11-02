# Paid building changes implementation plan

> Execute inline with superpowers:executing-plans. Parent owns independent review/publication.

**Goal:** Replace ordinary house pack/sale with20coin relocation and50coin demolition while recovering old bagged houses losslessly.
**Architecture:** Add atomic pure transactions over existing instance arrays; reuse footprint exclusion and placement UI; no storage/schema change.
**Spec:** docs/superpowers/specs/2026-10-26-paid-building-changes.md

1. [x] RED tests: different/overlap/same/occupied/missing/pending/poor/demo/repeat move, demolition debitonce/permanentblueprint/supportretain, obsoleteactionrejection, exact legacyrawhead/freeone-timereturn. Implement constants/reducer only; update obsolete state fixtures to explicit legacy data.
2. [x] RED UI/controller/scene tests: normalpaidcontext and inline confirm/cancel, placementpayonlyonsuccess, own-overlap preview and interactivehit handling, hiddenemptybuildingtab/legacyroute. Extend existing mode and update house-onlyhelp; preserve land/plant semantics.
3. [x] Full tests/check/build/diffcheck; independent review exactpin; freeze. Parent publishes after gate and performs nativeQA.
