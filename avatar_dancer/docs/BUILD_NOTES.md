# ENCORE · 双人舞台

Private internal demo. Source references and API credentials are not included in deployed assets. Personal photo inputs remain in the build workspace outside this project.

## Current technical direction
- Vanilla JavaScript / Vite / Three.js. Fixed 9:16 portrait shell on desktop and mobile.
- Two photo-conditioned characters, three materially distinct costumes each. All six have actual textured Tripo H3 geometry, Mixamo-compatible 23-bone rigs and three provider dance clips. Likeness has NOT passed owner review; direct-original-photo head rescue is in progress.
- ~67–72k triangles per active character after direct-source head replacement; one hero visible. Head/body base color and normal/ORM are 2K; low variant is 1K. Estimated texture mip memory is 128 / 32 MiB, not measured VRAM.
- Load one outfit at a time; retain previous hero until new load succeeds and release inactive GPU resources. DPR cap with adaptive reduction, one 1024px shadow map.
- Audio-clock based rhythm scoring, no fake autoplay score. Keyboard/touch input, pause/resume, replay, sorted mocked friends scores.
- Original instrumental STAGE RUSH: 128 BPM, 75s music +2s tail. No unlicensed artist recording. Local audio import stays on device and uses an estimated-tempo practice chart.

## QA constraints
The supported cloud browser currently cannot initialize WebGL. UI flows are exercised there, but no claims of actual GPU FPS or hardware smoothness are made. Model geometry/materials/rigged poses are rendered and inspected offline in Blender CPU. Pure Three.js animation tests use actual asset transforms to verify root-motion compensation.

## Run
`npm install` then `npm run dev`; `npm test`; `npm run build` produces static dist.

## Publication
Parent task owns private Sites registration/source synchronization/publication. Do not make this project public. No credentials should be stored in client code or repository.
