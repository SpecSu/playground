# School playground: isolated run admission

## Exact input and boundary

- Base: `a9cb1efe2b0f1cba1c7a4b0375c65b5ebf4c6a41`; independent branch, no P0/release tree writes.
- New derivative: `public/models/showcase/red-scarf-run.glb`, 1,792,648 bytes, SHA-256 `ec15c61b3fbb3c899aebd1d08c01d7224f761cae3f20879d55f8a4e872c81a21`.
- Author supplied a distinct `run` clip; old five clips, skin and maps are retained. This is not accelerated walking. Original white-clothing seams/folds remain and were accepted as a source limitation; no claim of flawless mesh.
- Exact duration 0.6000000238418579 s; normalized stride 0.44792210534943105 m; normalization 0.8294853802767241 is applied once. Natural straight speed is 0.7465368125843441 m/s. Fixed +0.0003 m support lift, not foot suction, preserves the two flight intervals.
- School-only admission is separate from the lunar catalog. Existing opaque verified asset scope is required. Missing/bad bytes or absent run fails closed, without a visible walk or generic-character substitute.
- 咕咕 is a user-provided display identity, not a linked account. The avatar `/assets/friends/gugu.png` is provided separately in identity commit `b99b348878a193cddc4ab883cfe57ec961d58194`. No UID, invitation, wallet, animal or boarding entry is created.

## Scene and runtime

The physical ground is 32 × 24 m, not a zoomed-out copy of the old 20 × 20 m farm. Original procedural school/bleachers/goals/fence/rest area: 77 meshes, 2,488 triangles. The track capsule has 6 m straight half-length and 6 m centerline radius; two columns are 1.4 m apart, four rows 2 m apart. Conservative runner radius is 0.45 m.

A shared unwrapped centerline progress defines all eight positions. Individual unwrapped lane distance drives independent run phases; outer-lane animation naturally runs faster on curves. No per-lap reset. One parsed template/download, eight independent cloned skeletons/mixers, shared geometry/textures; clones release without destroying siblings.

The dedicated World accepts no canonical state or account service. Only runner selection and whole-team pause/resume are permitted. Individual pickup, putdown, move, care, breeding and transactions are rejected below the UI. There is no individual carry or navigation in this observer scene. Hidden, blur, dialog, context loss and exit stop active time; late loads cannot resurrect a disposed scene. Rendering is one RAF and context restoration is idempotent. Follow/free overview transitions blend target and view extent continuously over 0.45 active seconds; hidden time cannot fast-forward this blend. There is no controllable-looking player avatar.

## Actual Three CPU measurements

Measured with the exact exported GLB, real parser/mixers/skinning, texture headers and injected renderer (not a browser/GPU visual test):

- 16,000 frames at 60 Hz, eight instances, 266.667 active seconds / 3.22657 laps; one download.
- Full posed-skin samples: 1,072. Minimum skin above raised track: +0.0468 mm. Maximum horizontal radius: 0.311933 m, below 0.45 m budget.
- Minimum conservative pair-envelope gap: 0.5 m. No lane escape or wrap teleport.
- Maximum measured contact-window XZ drift on curves: 3.906 mm over all fully foot-weighted vertices. Authored flight remains real: measured two-foot height reaches 17.157 mm; no vertical clamping/IK used.
- Actual World: 96 posed-skin ray picks across four route positions and 320×568, 390×844, 1280×720 viewports; all select the correct instance. Full skin bounds fit reserved HUD space. Default follow view minimum projected character height: 27.77 px; 42 px numbered touch controls are available only in an on-demand, horizontally scrollable keyboard picker. No permanent eight-person bottom bar is shown; pointer selection reveals a compact information card.
- Zero localStorage writes. CPU loader/lifecycle tests cover bad bytes, scope absence, late load, repeated dispose, modal/blur/hidden, viewer switch, forbidden commands and context restoration.

Committed tests include actual-public-GLB binding and multi-lap envelope checks. Detailed 60 Hz scripts/reports are archived separately under `drama-authoring/independent-review/school-playground/`; numeric results are also committed in `school-playground-run-cpu.json`. No mobile GPU performance or native browser visual acceptance is implied.

## Integration still owned by main

This branch supplies new isolated modules and a separate fifth-card export only. It does not overwrite current P0 `VisitorFarm`, `FriendsPanel`, `World`, controls or source pins. See `docs/evidence/school-playground-integration.md`; final combined App/home-camera regression and source pins belong to main after its current release is frozen.
