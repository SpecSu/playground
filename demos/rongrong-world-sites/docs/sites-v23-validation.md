# Sites V23 validation

Frozen upstream source: `33bcc5ff43e16df42081c4b947324116646da780` (validation-document timestamp clarification only; copied product bytes remain identical to `6b021abd9e003353bf361a8de3b8045918574051`); previous upstream baseline: `da53557848a2da2c3569e20a37dbfdce8b56d037`.

Only three runtime files changed from Sites V22: lab cat GLB, the asset index, and release metadata. The cat's torso markings are thin conforming surfaces instead of protruding cylindrical pieces. The other 24 laboratory animals and five production-farm animals are unchanged. This release does not replace production animals or alter gameplay, SSR, authentication, D1 adapters or storage.

Verified October 25, 2026:

- Full Sites test suite: 694 passed, 0 failed.
- Focused release tests: 65 passed; independent review: 35 tests passed, no blocking findings.
- Typecheck, scoped lint, offline production build and diff whitespace check passed.
- Compiled workerd HTTP: 52 anonymous route/method checks, two signed-in identities across five entry modes, and all 35 served GLB hashes passed.
- All 25 lab models match index hashes and byte lengths; only the cat's index record changes.
- Independent binary comparison preserved all 14 cat clips, nodes, skeleton/joints, inverse-bind arrays, and animation sampler data.
- Built client has 94 files and no static HTML/RSC gameplay bypass.

This is local compiled-worker and binary evidence, not real-browser OAuth, WebGL, touch, audio listening, FPS, or normal-distance visual acceptance. Existing device-scoped storage remains unchanged and is not account synchronization. Actual sharing permissions are separate platform configuration.
