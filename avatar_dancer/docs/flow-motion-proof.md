# Reproduce the continuous-dance proof

This is **offline studio evidence**, not a WebGL capture or gameplay-frame-rate benchmark. The original GLB materials are rendered in Blender; each vertex position is sampled from the production `createInputMotionController`, existing horizontal root lock and new foot grounding. No replacement animation is authored for the proof. Browser visual/performance QA remains separate.

Requirements: installed project dependencies, Blender 4.3+, Python, ffmpeg with libass.

From the project root, choose a private output directory outside the repository:

```bash
node scripts/capture_flow_proof.mjs public/assets/characters/jiji-0.glb "$PROOF_DIR"
blender -b --factory-startup --python scripts/render_flow_proof.py -- "$PROOF_DIR"
python scripts/caption_flow_proof.py "$PROOF_DIR"
ffmpeg -y -framerate 15 -i "$PROOF_DIR/frames/%04d.png" \
  -vf "subtitles=$PROOF_DIR/captions.srt" \
  -c:v libx264 -crf 21 -pix_fmt yuv420p -movflags +faststart "$PROOF_DIR/flow-proof.mp4"
```

The 26.07 second / 15 fps sequence contains sustained successful rhythm, one isolated miss at 7s, stopped input from 9–14s, and recovery followed by the real dance_01→dance_03 phrase transition around 21.53s. Diagnostic state/clip labels are derived from the controller, not guessed. Final delivery should retain a visible “offline studio / not browser footage” label. There is no audio track.

For an approved optional rest descriptor, pass `FLOW_REST_POSE` as JSON to the capture command. For example:
```bash
FLOW_REST_POSE='{"clip":"dance_01","time":3.475,"arms":{"clip":"dance_01","time":1}}' \
  node scripts/capture_flow_proof.mjs "$APPROVED_RIG" "$PROOF_DIR"
```

The Blender adapter maps original vertices by their rest-space position (verified maximum mapping error <0.1mm), disables imported deformation, and renders the actual runtime deformed vertices with original materials. Custom normals are recomputed for this diagnostic render. Fixed 480×640 camera, fixed lights, CPU Cycles 8 samples; this is not an image-generation or altered-body preview. Raw frame buffers and PNGs are large and must stay outside the production public directory.

Regression commands:
```bash
npm test
npm run build
THIRD_RIG_PATH="$APPROVED_RIG" REST_POSE_RIG="$APPROVED_RIG" \
  BODY_REFERENCE_RIG="$APPROVED_BODY_REFERENCE" \
  node --test tests/input-motion-manifest.test.mjs tests/rest-pose-config.test.mjs
```

When `BODY_REFERENCE_RIG` is provided, integration checks compare every body bone position/scale and every authored position-track key against the approved corrected-body reference. This rejects silently returning to old body lengths even if the rest-pose name still resolves.
