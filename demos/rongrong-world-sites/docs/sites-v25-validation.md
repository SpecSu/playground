# Sites V25 validation

Frozen upstream source: `294507b7defb434930edec5c9b07571c67c93450`; previous upstream baseline: `b9a1e08a1de56c502f77a1c948e863f864bc096b`.

This release synchronizes the compact visual farm panels and contextual question-mark help, plus the authorized 0.5 cells/second player walking pace and 1.1 stride. It preserves the actual-sole pond-clearance margin and non-farm motion behavior. The Sites SSR entry, ChatGPT gate, D1/backend adapters, save rules, model bytes, economy and truthful unavailable-feature states are unchanged.

Verified October 25, 2026:

- Sites' own complete suite passed 708/708 in one final run.
- Focused release tests passed 36/36; typecheck, scoped lint, offline build and diff checks passed.
- Additional UI/help/gait/actual-shoe checks passed 72/72 against the Sites files. These reuse the already installed upstream happy-dom in a test-only resolver, without changing dependency manifests or production code. An earlier relocated harness run failed because one fixture pointed to work/public; the fixture path was repaired before the successful complete rerun.
- Independent integration review passed 38 metadata/motion/auth/SSR tests plus three help/layout/visual-panel tests; no blocking findings. Closed PanelHelp also rendered without browser globals, and built CSS includes portal/card styles.
- Compiled workerd HTTP passed 52 anonymous route/method checks, two signed-in identities across five entry modes, and all 35 served GLB hashes. Its 94 client files contain no static HTML/RSC gameplay bypass.
- All 18 copied files match the upstream commit byte-for-byte; protected hosting adapters and assets have no diff.

Upstream source evidence is deliberately reported separately: its initial 2,050-test run passed 2,049 and failed one stale V24 walking-metadata assertion. After correcting that assertion, all 14 contract tests passed. This is combined coverage, not a single pristine full-source pass; the source full suite was not rerun. Upstream targeted/archive checks and the Sites final full suite are additional evidence, not a rewrite of that history.

These tests are DOM, geometry and local compiled-worker checks, not real-browser OAuth, WebGL/touch, normal-distance visual or audio/FPS acceptance. Existing browser/device-scoped saves are not account synchronization. Sharing permissions remain separate platform configuration.
