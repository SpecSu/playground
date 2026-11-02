# Rhythm-sustained continuous performer (v7 candidate)

The latest user direction supersedes the earlier one-arrow/one-gesture design: keep flexible full choreography and turns, with a visible response when rhythm falters or stops. Scoring, arrow timing, audio and song selection remain independent and unchanged.

## Runtime contract
- `dance-flow.js` owns presentation state only. Before the first **judged** Perfect/Good there is no gameplay dance. Wrong keys and automatic missed notes cannot start it.
- Successful notes sustain one advancing whole-body clip; lane and simultaneous chords never select/restart poses. The three actual source clips cycle at whole-phrase boundaries. Tempo-aware speed is bounded to 0.8–1.4; a 0.35–0.5s smooth whole-pose crossfade bridges clips. Full hip/root rotations are retained, not filtered to same-facing fragments.
- A single miss briefly dips energy/playback speed without resetting choreography. A smooth 0.55s upper-body hesitation (about 4° torso pitch, 3° roll, small shoulder response and neck counterbalance) makes the response visible; its 2.4s cooldown prevents repeated twitching, and hips/feet/facing are untouched. Misses within one overdue/chord burst are batched, and a successful chord member wins in either callback order. Three separated eligible misses shorten the remaining sustain window.
- Short chart gaps naturally keep the phrase; after roughly three beats without success (minimum1.1s), an0.85s smooth release starts. Longer gaps settle without creating scoring penalties. Exact rest follows the completed blend. Re-entry continues a sensible paused phrase rather than frame-zero restarting on every hit.
- Audio elapsed time advances the flow clock; presentation interpolation remains capped per frame. A current successful judgement after a long render gap is re-anchored to that current frame. Pause freezes phrase, energy, pending response and release clocks; resume reanchors audio time. New rounds reset to awaiting first success.
- Per-bone angular change is capped at7.5rad/s in gameplay; root X/Z remains anchored while authored turns/bounce/jumps survive. `foot-grounding.js` samples actual foot/toe-weighted skinned vertices (up to1024 per mesh), lifting only floor penetrations after the existing root lock. It does not pull jumps down or alter facing.
- Visible relaxed lobby sway/arm greeting, manual drag rotation and costume turntable remain separate. Cached original rigs and geometry are never mutated.

## Optional rest-pose configuration
Defaults are unchanged for every asset unless its definition explicitly supplies:
```js
restPose: { clip: 'dance_01', time: 3.475,
  arms: { clip: 'dance_01', time: 1 } }
```
A separate opt-in `restPose: { bind: true }` uses the native GLTF initial bone TRS before any animation sampling. It is mutually exclusive with clip/time/arms descriptors and exposes diagnostics `source: "bind", configured: true`; this avoids dance-sample clavicle depression without changing other avatars.

The body sample retains every position/scale. Only local shoulder/upper-arm/forearm/hand quaternions come from the second sample. Invalid descriptors fall back to the previous automatic rest selection. This support alone does not enable any manifest entry; the new Jiaxin integration is reviewed separately.

## Verification
- Pure flow tests cover no-input, misses/chords in both orders, low-FPS batching, musical gaps, pause/replay, tempo and long-frame judgement timing.
- Both actual100+ note charts run through `RhythmGame` with perfect and interrupted play; score/judgement totals remain authoritative and unchanged.
- Real7-rig tests run43s sustained streams at128/170BPM through all3clips, pause/replay, mid-turn/boundary interruption and recovery. They check actual skinned floor, rootXZ, frame-to-frame bone/head continuity and portrait gameplay safe frame.
- Additional tests cover lane-independent full turns, optional rest rawTRS preservation, visible planted-foot lobby motion and sampler behavior.
- Offline actual-skin projections and textured Blender frames are diagnostic renders of production-controller data, **not browser/gameplay footage**. No GPU FPS or subjective audio claim is made.

## Local avatar preparation adapter
`src/avatar-generation.js` wraps the local creation ledger and UI. The five-second timer is a simulated local preparation step, not an AI generation API. A manifest entry and an actually successful `stage.setCharacter` are required before unlock/points commit. Cancellation, absent assets and failed parsing cost zero; cancelling a pending model restores the selected outfit. Main wires UI callbacks, progress, generation busy/start gating and owned-outfit guards. `tests/avatar-generation.test.mjs` covers timer, result acknowledgement, cancellation, duplicate clicks and one-time costume debit.
