# Species animation contract

The runtime reads `extras.speciesRig` from the authored GLB hierarchy. `animal-v2` enables the four biped animal styles; `quadruped` additionally assigns `upperArm → forearm → hand` as foreleg contacts. Assets without either marker retain their previous animation. Humans, monsters and the resident cockatoo are unchanged.

All species use the room's shared absolute musical beat. A pose is recomputed from bind transforms every update, without accumulated spring state or elapsed-frame integration. Group beat, activation, version-two double hop timing, route placement and navigation yaw keep their existing owners. Reduced motion resets all authored bones, including optional ears and tails, to a stable quiet pose.

- Cat: compact fast torso bops on double-frequency accents, shorter hip sway, and delayed two-joint tail flicks.
- Frog: low preload slouch, expanding torso recoil and springing lift. Anatomical crouch depth is constrained by the short body rather than copied from human legs.
- Dog: long alternating spine/chest/neck waves, a delayed head throw, floppy-ear follow-through and tail swing.
- Panda: a slow side-to-side hip and belly roll with a delayed upper body and bent-paw gestures. Group elbows remain bent so intermediate activation cannot spread the skin outside the one-metre lane.
- Capybara: a horizontal barrel groove, head/neck recoil and paw taps over four articulated contacts. Group wave, battle, grid and unison translate human arm gestures into forepaw responses; train uses the actual four-legged gait.

The capybara reuses the existing two-bone contact solvers. Hind feet retain their names; front contacts map to `hand_L` and `hand_R`. Foreleg elbows bend backward while hind knees bend forward. Diagonal contact pairs use opposite half-cycles on the travelled arc distance. Stance targets are sampled from the actual manual or group trail, including authored lateral and longitudinal paw offsets. No navigation radius, collision rule, or tracking root transform is changed.

The optional cat/dog `tail` and `tailTip`, plus dog `ear_L` and `ear_R`, must influence real skin. Empty decorative bone names do not satisfy the regression checks.

## Offline verification

From the repository root:

    node --experimental-strip-types --test tests/club-species-motion.test.ts
    node --experimental-strip-types scripts/avatars/animal-diversity/probe_motion.mjs /absolute/asset-dir /absolute/report.json

To test staged GLBs without installing them:

    ANIMAL_ASSET_DIR=/absolute/asset-dir node --experimental-strip-types --test tests/club-species-motion.test.ts

The probe samples actual deformed skin across dance, bounce, wave, spin, all five group modes and manual gait. It reports floor clearance, full radial envelope and nickname clearance per mode. The tests additionally verify stable world-space paw contacts, secondary-joint influences, history-independent seeking, static reduced motion and partial-activation safety margins. These checks do not claim browser/WebGL, audio, device performance or live multiplayer acceptance.

## Actual runtime pose strips

    node --experimental-strip-types scripts/avatars/animal-diversity/export_motion_review.mjs /absolute/asset-dir /absolute/review-dir/actual-motion-sheet.glb
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/animal-diversity/render_motion_review.py -- /absolute/review-dir

The review exporter bakes the same runtime-skinned vertices into ordinary meshes. The renderer does not substitute Blender animation. Its six columns show three dance beats, a bounce, a wave and manual walking, with one strip per species. Keep these large inspection GLBs and PNGs outside the public shipping directory.
