# Personal and team backflips

The existing personal `wave` action key renders 后空翻. Its six-second command contains two complete backward somersaults, each followed by landing recovery. The same deterministic flip phrase is used by the alternating left/right teams of version-two 左右对跳. The existing action keys, shared room timestamps and transport contract are preserved.

Every model keeps its authored scale and limb dimensions for the entire phrase. The tuck is made only with joints. A model-specific body-center pivot carries the complete 360-degree backward rotation over the fixed navigation root. Human-jiji uses a corrected rotation center; the tall tower rises earlier and stays airborne longer at the shoulders of its trajectory so the broad full-size torso clears booth height before inversion and unfolding. Neither change compresses the character or caps its height. The sword and shield remain rigid at their original hand grips without affine compensation.

Actual-skin tests retain the one-metre full-body envelope used by automatic routes. Full-size airborne cores can exceed the 0.65-metre grounded manual radius; this must be handled by active-flip presentation spacing, not by shrinking the avatar or claiming the old core bound still holds. The tests also verify floor clearance, fixed room placement, exact full authored scales and bone lengths, rigid props, complete backward rotation, personal/team pose identity, and quiet recovery.

## Offline inspection

From the repository root:

    node --experimental-strip-types --test tests/club-backflip.test.ts tests/club-nameplate.test.ts
    node --experimental-strip-types scripts/avatars/export_backflip.mjs
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/render_backflip.py

The exporter measures 193 actual runtime skin poses over the entire six-second personal action for each of the twelve live models. It writes measured floor/height/full-body/core-body bounds and a baked GLB outside the public directory under `../avatar-offline-previews/backflip`.

Each strip samples the first complete phrase at 0, 200, 400, 600, 740, 880, 1100, 1300, 1480, 1600 and 1800 milliseconds. Front and side strips show the same baked geometry. In side strips, characters face right; the start of a backward somersault therefore moves the head toward the left. The pose returns upright before the recovery frame. Pass an output directory and character IDs after `--` to render other models; add `--only-side` to render only side views. Denoising is disabled for the installed Blender build.

The exporter bakes `getVertexPosition` results from the real runtime adapter. It does not invent a separate preview animation. No shipping GLB, browser or audio is changed or started by these scripts.

Nickname anchors remain at their established fixed world heights. They do not follow or rotate with the airborne body; a brief high flip may pass behind the foreground nickname. Tests sweep the whole personal timeline and actual held props through three narrow phone follow-camera sizes.

## Stronger punch review

The punch phrase keeps its six accepted impact times, but each strike now extends in 100 ms and recoils in 200 ms. Larger hip drive, chest torque, straighter arm targets and species-specific paw/short-arm gestures make the hit readable without scaling limbs. Both hind paws stay planted for capybara. Rigid knife/shield attachments and all other emotion mappings stay intact.

    node --experimental-strip-types --test tests/club-emotion-motion.test.ts
    node --experimental-strip-types scripts/avatars/export_emotions.mjs
    blender -b -t 4 --python-exit-code 1 -P scripts/avatars/render_emotions.py -- ../avatar-offline-previews/emotions --only-side

Punch strips show rest, guard, extension, impact, recoil, alternating impact, recoil and final recovery at 0, 600, 870, 920, 1120, 1620, 1820 and 5750 ms. Five representative species are baked. The automated actual-skin check covers all twelve species, samples punch every 20 ms including every exact impact, and retains the full 1.0 m/core 0.65 m grounded envelopes.
