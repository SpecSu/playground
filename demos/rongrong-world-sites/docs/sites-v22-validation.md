# Sites V22 validation

Frozen upstream source: `da53557848a2da2c3569e20a37dbfdce8b56d037`. This includes checksum-only closure over product commit `39700f1904f1eadd57fa0386a55e2853523d4cbf`; copied product bytes are identical.

Only four runtime files changed from Sites V21: lab dog GLB, lab bear GLB, their asset index, and release metadata. This is a provisional-lab shoulder/leg-join polish, not replacement of the farm's production animals. SSR, authentication, D1 adapters, application chunks and persistence semantics remain unchanged.

Verified October 25, 2026:

- Full Sites test suite: 693 passed, 0 failed.
- Focused release tests: 64 passed; independent review: 34 tests passed, no blocking findings.
- Typecheck, scoped lint, offline production build and diff whitespace check passed.
- Compiled workerd HTTP: 52 anonymous route/method checks, two signed-in identities across five entry modes, and all 35 served GLB hashes passed.
- All 25 lab models match index hashes and byte lengths. Only dog and bear index entries change semantically; other textual index changes are equivalent number formatting.
- Independent binary comparison preserved dog 12 clips, bear 14 clips, nodes, skeleton/joints, inverse-bind arrays, and animation sampler data.
- Built client has 94 files and no static HTML/RSC gameplay bypass.

These checks do not establish real-browser OAuth, WebGL, touch, audio listening or FPS acceptance. Existing device-scoped storage remains unchanged; this release does not add account synchronization. Actual sharing permissions are separate platform configuration, not a claim made by these build results.
