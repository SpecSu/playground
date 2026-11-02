# v12 audible-beat camera correction

## Cause and bounded change

v11 used a flow-weight-multiplied1.5%two-beat sine and an8-beat10%phrase push, then low-passed everything at6/s. That made quick musical attacks effectively disappear. It also knew BPM but not the measured beat-grid phase.

v12 keeps the150%default, lobby, result finale, actor animation and all GLBs unchanged. Playing uses an8-beat accent pattern `[1,0,.58,0,.88,0,.48,.25]`: strong beats push19%even without successful input, increasing to22%with flow. This is not triggered by keys or judgments. A small4%phrase push is separate. No camera roll, random shake or per-arrow cuts.

Each accent starts75ms BEFORE its grid beat, reaches maximum ON the beat and returns over225ms. At imported tempi above200BPM the return shortens to finish smoothly before the next anticipatory attack. The slowly varying composition is6/s smoothed; the already-smooth beat envelope is applied afterward, so that lowpass cannot erase it. Runtime pose-dependent upper-body retreat remains composition-only.

## Timing contract

`setBPM(bpm, offset)` receives the existing song metadata, not the first chart note. The phase is signed `(audio.time-offset)*bpm/60`, with positive modular indexing; POPSTARS's7.11sanchor does not freeze its earlier intro. Chart times remain absolute and unchanged.

- POPSTARS169.99BPM, offset7.11s.
- FANTASTIC130.03BPM, offset1.776s.
- KILLLOVE131.995BPM, offset.01s.

Initial load, successful built-in starts/replays and local import pass the phase; manual selection obtains its metadata and applies it on successful start. Pause freezes both rendered camera and composition state. Resume samples absolute audio time, with no catch-up integration. Reduced motion keeps a static150%frame and no beat pulse.

## Evidence and limits

The three8second offline comparison videos use original game-audio8–16s and actual production-controller CPU-skinned poses. At24fps the capture reproduces the actual postfilter composition matrix, direct pulse, target shift and pose-dependent retreat, not only an ideal target curve. Left side is actualv11 math/6s⁻¹filter, right side isv12. Original materials are rendered offline; these are not webpage recordings or mobile-performance measurements.

Measured postfilter distance ranges in those excerpts:

| Track | v11 | v12 |
|---|---|---|
| POPSTARS |5.099–5.381m|4.103–5.351m|
| FANTASTIC |4.768–5.386m|4.107–5.333m|
| KILLLOVE |4.768–5.386m|4.126–5.333m|

Independent maximum-push skin checks covered8looks×3clips×24poses. Actual faces remain visible (minimum top~7.37%; Pharaoh crown alone~3.22%, actual face~7.68%). Strong closeups intentionally crop lower legs; projected soles may reach92–95%behind the fixed UI. This is NOT a claim that the old full-body safe frame still holds. Arrows, judgment, buttons and input geometry are unchanged.

Tests cover three offsets, normal-play amplitude, strong/weak contrast,75/225mscurve, negative-time phase,30/60fpspeak alignment, fast-import continuity and reduced motion. Existing suite covers pause/replay/lobby/results independently.

Reproduction:

```
node scripts/capture_camera_rhythm_proof.mjs popstars /tmp/camera-popstars
blender -b -t 4 -P scripts/render_camera_rhythm_proof.py -- /tmp/camera-popstars
# PROOF_FPS=30 or60 additionally writes exact postfilter curves at those cadences.
```

No audio, chart, scoring, model or texture changes; no paid API.

Final exact runtime-equivalent simulation at30/60fps (actual postfilter camera-distance extrema around measured strong beats, not just envelope targets): POPSTARS maximum peak timing error21.12/11.49ms; FANTASTIC16.30/12.03ms; KILLLOVE13.83/12.25ms. Sampled strong pulses remain18.88–19.21%minimum in these Good-input excerpts. Final full suite234/234 and build passed. SHA256 comparison toHEAD confirmed all16GLBs and9audio/metadata files unchanged.
