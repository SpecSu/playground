# Blender cow animation study

This is a real Blender-authored skinned mesh with an Armature and five animation actions, not a procedural group pivot animation. It is a sample cow, not a claim that every farm animal has been converted.

## Files

- `build_cow.py`: repeatable geometry, pigment, rig, skin weights, clips and export.
- `cow-animated.blend`: editable source, clean of preview set dressing.
- `../../public/models/farm/cow-animated.glb`: Three.js-ready binary asset.
- `asset-contract.json`: rig names, coordinates and motion contract.
- `validate_glb.py` / `validation-report.json`: binary structure, weights and animation seam checks.
- `validate_blend.py` / `topology-report.json`: source hide is one closed connected component, with no nonmanifold edges or loose vertices.
- `preview/cow-animation-offline.mp4`: offline Blender Cycles motion study, not a browser/WebGL capture.
- `preview/cow-animation-contact-sheet.jpg`: labelled offline-rendered pose sheet.

## Rebuild

From the farm directory, with Blender 4.3.2 and Python available:

    blender -b -t 6 --python art-source/cow-animation/build_cow.py
    python art-source/cow-animation/validate_glb.py
    blender -b -t 2 --python art-source/cow-animation/validate_blend.py

Add `-- --stills` to render the six QA poses, or `-- --preview` to also render the motion sequence. Then run `python art-source/cow-animation/package_preview.py`. The preview renderer uses CPU Cycles without denoising because the available Blender build has no OpenImageDenoise support. Rendering is optional and does not change the exported model's geometry or animation.

## Runtime contract

- Three.js axes: +Y up and +Z forward. Model units are meters, ground datum Y=0.
- Twenty-six bones; one skin. All visible geometry is weighted, including eyes, horns, lips, tail and hooves.
- Main cream body, neck, head and all four white legs form one voxel-welded surface. Brown patches and pink ear insets are vertex pigment rather than floating decal geometry.
- `cow_head` is the head bone. Neck chain is `cow_neck_01` / `cow_neck_02`.
- `feeding-mouth`, `animal-support`, `animal-head`, `animal-ground` are bone/node anchors.
- Idle mouth: approximately (0, .84, .765). Stable drink contact: (0, .045, .72), with a ±.003 sip pulse. Support marker: (0, .345, -.06) in idle.
- Clips are `idle`, `walk`, `drink_enter`, `drink_loop`, `drink_exit`. Exact frame-quantized durations are recorded in the validation report; runtime should read the clip durations rather than assuming round seconds.
- `walk` is an in-place four-beat gait with .58m intended root travel per cycle, .66 stance duty, planted stance feet and bent swing legs. Runtime owns navigation/root position and uses traveled distance to drive gait phase.
- Drink entry/exit use a two-segment cervical bend and a small body lean; hooves remain planted. `drink_loop` has three subtle sips. The head does not teleport down, and no root tilt is needed.
- Runtime may blend clips and make a bounded contact correction for terrain/bowl height. Large contact mismatches should adjust stance rather than stretch the neck indefinitely.

## Scope and limitations

This is a deliberately compact stylized study, produced with scripted Blender construction and purposeful skin weights. It is not motion capture or a production retopology pass. Remaining polish can include artist-designed quad topology at the shoulder, hoof/toe shape refinement, and species-specific rest/carry actions. Ground contact, model loading, carry envelopes and multiple-instance mixing should be checked in the application independently. Offline Cycles renders are not proof of browser rendering.
