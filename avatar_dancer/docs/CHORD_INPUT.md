# Multi-lane chord input repair

## Diagnosed
Scoring already supported distinct notes at the same timestamp. UI did not retain press ownership: each key had only a130ms flash; no keyup, per-pointer capture/release or held aliases. This made two held directions appear unlit soon after press. Rendering only `lastJudgement` also dropped the first receptor burst when two judgments happened between animation frames.

## Behavior
- Independent source ownership per pointer ID and keyboard code. All four lanes can remain lit simultaneously; non-primary touch pointers are accepted.
- Key aliases (A/ArrowLeft etc.) and overlapping sources for the same lane create one logical press until all owners release. No global debounce or lane exclusion.
- Pointer capture retains release delivery outside a button. Pointerup, pointercancel, lostcapture, keyup, blur, hidden document and mode changes clear relevant ownership. Cancel/blur/pause clears feedback immediately; a normal quick tap keeps a130ms minimum flash.
- Touch synthetic clicks, including zero-detail clicks, are not another judgment. Explicit keyboard/assistive click remains available. Key repeat/composition/editable fields do not score.
- Input state and judged feedback are separate. Per-note rendered-feedback IDs preserve both receptor flashes and bursts for same-frame chords without replaying them next frame. Latest judgment still owns central text.
- `touch-action:none` stays scoped to lane buttons; no global touch gesture interception was introduced.

## Verification
Tests written first and observed failing for held multi-touch, keyboard aliases, synthetic clicks, cleanup, and both chord bursts. Tests use the actual RhythmGame and a shared timestamp for two notes on distinct lanes; score2000, perfect2, both lights held after160ms, one release leaves the other lit. Added minimum-flash and AT-click regression. Full135 tests pass at this revision; production build checked separately.

Local-only `qa-avatar-fixture.html` adds “Chord drill A+D”: actual RhythmGame with paired left/right notes every3seconds. Banner reports held lanes and score. Fixture contains noWebGL, uses explicit stub model load and isolated in-memory progression. Root CUA can inspect keyboard chord light/release and pause behavior. Automated PointerEvent boundary tests are not a real physical phone test. Remove fixture before packaging.

## Supported cloud-browser check
Root used native CUA A+D key injection on the actual fixture UI. Held screenshot showed both pink/left and mint/right keys plus receptors lit together, with visible `held0+3` status. A timed chord produced1650 points/combo2 (one Perfect and one Good); release returned `heldnone`. This confirms desktop browser keyboard chord dispatch, scoring and simultaneous visual hold/release. Multi-pointer mobile behavior is covered by automated pointer-ID boundary tests, not a physical-phone run.

Additional fallback test: when setPointerCapture throws, window pointerup still clears the correct lane; no global gesture prevention is added. Final production build passes with the existing bundle-size warning.
