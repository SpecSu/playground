# Sites V24 validation

Frozen upstream source: `b9a1e08a1de56c502f77a1c948e863f864bc096b`; previous upstream baseline: `33bcc5ff43e16df42081c4b947324116646da780`.

The only runtime source change is the animation-lab controller's cleanup of resources acquired before a failed startup, plus release metadata. Ownership cleanup is idempotent and drains remaining disposers if one fails, while preserving the original startup error for the existing error and Retry interface. Normal hidden-page frame scheduling is unchanged.

Verified October 25, 2026:

- Full Sites test suite: 706 passed, 0 failed.
- Focused release tests: 77 passed; independent integration review: 37 tests passed, no blocking findings.
- Typecheck, scoped lint, offline production build and diff whitespace check passed.
- Compiled workerd HTTP: 52 anonymous route/method checks, two signed-in identities across five entry modes, and all 35 served GLB hashes passed.
- Built client has 94 files and no static HTML/RSC gameplay bypass.
- All model bytes, authentication, SSR adapter, D1/backend adapters, gameplay and storage logic are unchanged.

The upstream React fault-and-retry test was verified in the farm source workflow. Sites copies the focused controller startup regression tests without adding a new DOM-test dependency. Local compiled-worker and injected-controller checks are not actual browser OAuth, WebGL, touch, audio or FPS acceptance.

Existing browser/device-scoped saves remain unchanged, not account synchronization. Actual sharing permissions remain separate platform configuration.
