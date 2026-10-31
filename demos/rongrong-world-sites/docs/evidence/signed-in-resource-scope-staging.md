# Signed-in farm resource scope — integrated follow-on candidate

The user-authorized follow-on scope is the exact public origin `https://fluffy-farm-companions.tangguozhou.chatgpt.site`, after trusted platform login. This change separates that operational scope from named-demo identity and from mobile production-quality evidence.

- A new frozen/WeakMap-issued signed-in-farm token references four unchanged verified artifacts and the unchanged source package identity. The original named-demo/local receipts are not edited.
- All original candidate/profile/GLB/hash checks remain in the preparation path. `prepareSignedInFarm` adds a target-bound resource path; mobile evidence remains `unmeasured` and display copy says so.
- Named tokens do not pass signed-in assertions, signed-in tokens do not pass named assertions, and serialized/forged tokens pass neither. Inspection remains non-commercial.
- `server/signed-in-farm-resources.ts` is used only by the trusted Sites adapter: it requires a trusted subject, excludes `?name` selectors and enforces the exact public origin. It is not a login or ownership validator.
- **Integrated, not published by this worker:** the Sites adapter selects resources only at the exact approved origin with a trusted subject and no named selector. GET farm advertises a separate `signed-in-farm` resource capability. AccountClient validates identity/capability before invoking the real preparation callback and refuses resource-enabled entry without it. FarmEntry waits for actual preparation before opening a model-dependent save. Issued formal/demo commerce tokens are accepted by authority; inspection and forged tokens are not. P0 remains a separate earlier publication.

Tests: new resource-scope tests went from missing-feature RED to **6/6**; adjacent named-demo/source-evidence/species/custom-lifecycle checks **42/42**, typecheck and changed-source lint passed. Final whole-tree verification follows integration, not claimed by this staging note.

Independent review found one preparation-ordering race before the dynamic-import boundary: a later clear could lose to an older scoped start. Added two reproductions (both RED), then reserved ordered intents before scoped awaits; direct preparations, named/formal changes and runtime failure invalidate older work. Old error handlers cannot revoke a newer scope. Both new regressions now pass (8/8 scope tests, 14/14 with named/evidence checks). Stale superseded wrapper calls return false; the session coordinator remains responsible for coalescing duplicate startup requests.

P0 commit `d5decf5` was independently preserved as integrated cherry-pick `e49a8fc`; the first integration run passed 808/808 and the real React/World/GLB CPU suite 7/7 before the ordering fix. The later custom/P0 aggregate passed 834/834. A new whole-tree aggregate is still required after the social UI and recovery changes below.

## Integrated recovery and compatibility checks

- `9614a37` / `65b7e4f`: trusted API, account/bootstrap and real React entry integration. Three new tests were RED, then 33/33 related checks passed. Entry DOM covers account-first preparation and reconnect without legacy clearing (1/1).
- `488c942`: explicit coordinator validates all four unchanged GLBs; six new tests include real bytes. No new animal species is admitted.
- `b4f7ae0` (source `4f9fea3`): independent review reproduced settings/asset retries clearing healthy formal providers via null local config. Recovery now binds the already-issued context, actual origin, scope and candidate identities; current provider readiness invalidates stale loaded metadata. Both named and formal paths rehash revoked bytes. New exact-candidate mismatch/corruption paths fail closed; old receipts stay unchanged. Reviewer and integrator inspected the helper; 53/53 tests and 8/8 formal/P0 CPU DOM checks passed.
- New providers retain `demo-only` evidence quality and explicit unmeasured mobile performance, despite their separately authorized formal-farm usage scope. This is not a mobile production-quality claim.

No hosted HTTP, browser/WebGL, touch or mobile GPU acceptance is claimed. Publication is owned by the parent task.
