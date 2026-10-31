# Demand-driven animal loading — verified staging change

Code commit: `9d2e3c31999b63e07d79436e1ad51699ffcfa8e2` (base `493f6e9d0e9ecbe7b5111d4202cf9ae97d6f1c3b`). No new species is admitted by this change.

- Existing per-species template cache now submits fetch/decode/validation work through a FIFO limit of two active jobs. Shared templates, explicit retries, failure eviction, real asset validation and actor disposal remain intact.
- No catalog-wide eager load is added. Existing startup preparation for the four approved replacement resources is unchanged; this budget applies to `AnimalAssetLibrary`, not unrelated startup or environment asset work.
- No authority, save, account synchronization, World interpolation, ecological pool or existing model byte changes.

## Verification

- Baseline `npm test`: **787/787** passed.
- New tests before implementation: **0/2** passed for the expected bug (all five/three distinct requests started together).
- Animal loader/owned-egg preload/actual skeletal lifecycle regression: **23/23** passed.
- Final `npm test`: **789/789** passed after updating the exact source-sync manifest to the actual committed bytes.
- `npm run typecheck`: passed.
- Full shipped-source lint: passed with no warnings/errors using `node node_modules/eslint/bin/eslint.js --no-ignore --config eslint.config.mjs app components db hooks lib server src tests scripts worker *.ts *.mjs`.
- `npm run build`: passed. Existing build notices remain: npm environment `http-proxy` deprecation, chunk-size advisory and vinext static route-classification limitation.
- `git diff --check`: passed.

The initial whole-suite rerun was **788/789** because the source-sync guard correctly detected the intentional `animal-assets.ts` edit. Its exact hash and the new module hash were refreshed against `git show 9d2e3c3:<file>`; no guard or asset receipt was removed or relaxed. An attempted `--no-ignore .` lint included the separate nested `work/teleports` worker checkout and failed on that non-release tree; explicit top-level source roots above cover the release source without that false scope expansion.

This is CPU/build evidence only. `*.dom.mjs` is not included in the project's `npm test` command; browser, touch, mobile FPS/GPU and hosted network verification were not run. Root owns publication and the separate P0 teleport fix.

## Independent review

Fresh reviewer reported no blocking findings, with 148 focused/adjacent tests and executable FIFO/synchronous-failure/reentrancy/forged-inspection probes passed. Nonblocking limitations retained: the cap is per library; duplicate provider consumers can share one registry operation while occupying two slots; committed coverage could additionally pin synchronous and mixed-provider scheduling. These are not claims of full runtime admission or device performance.
