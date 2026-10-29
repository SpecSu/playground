# V11 aftershow and camera implementation plan

Goal: make the existing performer more expressive without changing any GLB, face, scoring or note UI.
Architecture: one renderer/actor, pure presentation timing, bounded bone overlay and camera-only framing. Results reparent the existing canvas into UI's right-side hero host; no additional context/model. UI owns SVG particles and copy.
Approved constraints: all16GLBs have23 joints, no finger/facial joints or morphs; therefore a nose-side hand gesture and head tilt, not literal finger articulation or a generated smile. No asset/API changes.

- [ ] Pure aftershow timeline: results entry increments runId;0–.4 settle,.4–1.3 turn120°,1.3–2.2 return35° with lookback;1.9–3.2 nose-side gesture;4s onward relaxed hold. One popcorn event atturn, no repeat. Exit/hidden/reset/reduced-motion guarded.
- [ ] Bounded rig poses using existing ready pose, world-space upper-body rotations and two-bone arm targeting. Calibrate head-weighted bounds, keep actual hand vertices outside padded head bounds; fallback to lower cheek gesture if unreachable. Preserve positions/scales, feet and all gameplay motion.
- [ ] Playing camera: defaultz8→5.333,targety.42→.65 (~150% projected height). Head central/top~8–12%, feet~68–72%; old full-body61% constraint superseded. Occasional16beat medium-close window and2beat±1.5% breathing, only sustained flow. Pause locks frame; reduced-motion retains static150%; lobby existing full-body unchanged.
- [ ] Stage portrait adapter: alpha:true atcreation; normal background unchanged. Results transparent background/fog off and stage geometry hidden, lights+sameactor retained. Active-host ResizeObserver, aspect and restore. setResultPortraitTarget(host|null) idempotent. onAftershowEvent({type:'popcorn',runId}).
- [ ] Tests first: timeline exactly-once, exit/reenter, pause/hidden/reduced; actual16GLB head/hand clearance and continuity; enlarged camera projections without HUD changes; singlecanvas reparent/restore/dispose. Offline actual-skin contact frames, full tests/build, no browserGPU claims where unavailable.

Files: new src/aftershow.js and src/aftershow-rig.js; narrow src/input-motion.js and src/stage.js; focused tests. UI/main are owned by the UIworker. No commit/deploy by this worker.
