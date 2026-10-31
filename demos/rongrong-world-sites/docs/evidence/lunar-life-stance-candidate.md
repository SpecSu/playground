# Lunar life / contact candidate — not a production admission

Base: published v33 `33d5a5cfe6b4b6d21d31a7c9c2eb603881de2ec3`.
This checkpoint preserves the new runtime and regression work. The compiled public
catalog still contains the v33 assets; final walk assets remain inspection inputs
until the unique independent motion and World reviewers approve the combined source.

## Contact correction

The original stationary yaw with a straight-walk clip slid a giant floral foot
383.94 mm during one stance. A first ankle-lock attempt incorrectly used forward
stride end-points for turning; it exceeded reach and bent dog lower-leg skin below
ground. These are recorded failures, not accepted tolerances.

The replacement uses real idle-neutral landing points for pivot steps, actual
walk swing clearance, and world-locked ankle position **and orientation** during
stance. Every foot owns its landing heading. Independent actual-rig measurements
sampled 60 walk phases × 9 signed headings within ±0.20 rad for each of the five
rigs at maximum growth; all were reachable with neutral feet and no extra crouch.
The runtime uses a conservative 0.18 rad per-plant limit and still checks actual
length constraints. Swing targets do not impose planted-foot body constraints.
All joint corrections are rotations; authored child translations/scales remain.
Forward motion begins only after heading error is below 0.001 rad, rather than
sliding diagonally into a still-turning stance. The walk phase is not reset at the
pivot/forward boundary. Root translation and heading are limited together by
reachable support; a bounded forward-handoff crouch releases continuously.
Simulation divides an active delta (already capped at 250 ms) into steps at most
1/60 second. It does not multiply elapsed age or replay hidden wall time. One
render follows the integrated frame. This also closes a 20 Hz contact-boundary
counterexample which a 60 Hz-only check missed.

## Candidate checks so far

* Real five-model 120-second, 60 Hz all-sole/full-skin oracle: 0 unreachable frames
  for all five; full mesh minima at numerical zero. Worst strict-stance horizontal
  displacement: dog 0.959 mm, chicken 0.00255 mm, red 0.470 mm, sheep 0.516 mm,
  floral 0.000350 mm. The small growing-actor displacement includes continuous
  growth of the rigid sole; it is not called exact zero.
* Actual 20 Hz caller / bounded substep replay closes the skipped-leg vertical
  correction counterexample. Further exact-input independent review is required.
* Rotational knee-branch transport and carried-contact reset have RED→GREEN unit
  regressions. Clearing a carried actor also clears its old body-drop state.
* Real runtime movement, repeated actions, growth, whole-body dry footprints,
  basketball return and World/carry checks must be revalidated on this checkpoint.

Production evaluates a fixed low skinned floor subset, not full meshes each frame:
1564 / 397 / 683 / 324 / 1217 vertices for dog/chicken/red/sheep/floral, with
4 / 2 / 2 / 2 / 2 IK legs. Rigid-foot vectors and scratch vectors are cached; full
mesh skinning is a test oracle. A Node CPU-only run of all five fully grown actors
for 7200 active steps measured mean 1.98 ms, p95 3.10 ms, p99 3.68 ms per scene step
on this execution host. These are not browser, renderer, GPU or mobile FPS results.

Sample growth stays visitor-memory-only, explicitly resets on departure, and does
not create owned animals, currency, receipts, transfers or server identities.

## Procedural handoff correction (subsequent checkpoint)

The a5504db steady-contact check did not establish entry/exit continuity. Independent
1e-4-second tests found a 148.3 mm idle→turn jump: applying full IK after the display
fade bypassed the fade. The corrected order is pure clip → rotational contact IK
→ final display-pose blend → grounded floor / carry support positioning. Both a
clip revision and a procedural mode change capture the actually displayed post-IK
pose. A single bounded 180 ms `replant` stage holds root XZ/yaw and walk phase,
rebuilds the new mode's contacts, and blends into them before locomotion resumes.
It does not masquerade as strict planted stance. `lunarContactEpoch` identifies
new contacts; trajectory checks still include every replant frame and epsilon
entry/exit checks. The body is not hidden, teleported, or moved without leg motion.

The source phase is retained across pivot/forward changes; stale forward-extreme
anchors are not incorrectly treated as neutral turn anchors. A care-accelerated
sample that exposed this mismatch now has zero unreachable contacts. During a
120-second full-mesh scan of every replant frame, root XZ motion was zero and the
lowest displayed skin stayed on the ground (red's maximum positive clearance was
0.0108 mm, others floating-point zero). Exact-source independent temporal review
is still required; these results are not a public admission or mobile visual QA.

## Supported replant arcs (56e1d25)

The 3df4f06 display blend closed epsilon pose jumps, but independent all-sole
tracking found a chicken foot moving 15–19 cm while still on the floor. That is
not accepted as a natural step. The replacement captures actual foot transforms,
first lowers an already-airborne foot before moving its only support, then moves
the target support foot (quadruped diagonal groups) on a smooth lifted arc, and
raises the target swing foot last. Other feet retain their world position and
orientation. The same two-bone rotation solve retains all child translations and
scales; it reports unreachable targets explicitly. Durations are bounded by the
small plan, normally .36–.40 seconds for bipeds, at most .52 for four legs.

The exact chicken case now raises the sole 49.3 mm before landing; initial author
120-second full-skin replant scans show zero unreachable targets, root XZ motion
zero, no negative skin depth beyond floating point and no whole-body hover above
0.99 mm. Independent temporal/trajectory review remains required. The final five
walk bytes may be staged locally for combined tests; staging is not publication.
