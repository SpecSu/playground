# Personal Building Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close personalized4cellbuilding creation→permanentblueprint→coinconstruction→pack/restore/sale without changingplantcreation.

**Architecture:** A small trustedblueprintcatalogue derives visualmetadata and fixed60/30prices. Optionalstatecollections share footprintvalidation withplants; existingexhibitrenderer/directcontrols display personalinstances. Checksum-first legacy hydration isextended, not replaced.

**Tech Stack:** PureESmodule reducers,Canvas2D,DOMtrays,node:test.

**Spec:** `docs/superpowers/specs/2026-10-26-personal-building-loop.md`

## Global Constraints
- Explicit1crystal permanentblueprint;60coins pernewinstance;freeexactinstance pack/restore;one-time30coinsale.
- Threeexistingofflineart/sourcephoto samples only; no realphotos/upload/liveAI.
- Shared2×2 emptyland/platform supports; no overlap/nonanchorremoval/autoexpansion.
- Samekey/version/checksum-first migration/rawhead; originalgameplay/IDs/avatars preserved.
- Workerdoesnotpublish; parentdecidesstagingafterindependentreview.

## Review Focus
- Mixedsupports andmissingfourthcell mustnotdebit orcreate (Task1).
- Prototype/coercedblueprint/instance refs andcross-container duplicateIDs rejected (Task1).
- Oldchecksummedv6/v8saves hydrateoptionalfields losslessly withrawheadunchanged (Task1).
- Duplicate/remix idempotency and60/30repeatedpack/sale cannotduplicatecurrency (Task1).
- Leavingcreation/selectionorforeignadoption cannotrebuildfocusededitor orapplystalechoice (Task2/3, existinggatesretained).

### Task1: Trusted blueprints, atomic transactions and sharedoccupancy
**Files:** new `src/blueprints.js`; `src/footprints.js`, `src/state.js`, `src/storage.js`, `src/catalogue.js`; tests/blueprints.test.js andstorage/footprinttests.
**Interfaces:** immutable `BUILDING_SAMPLES`, `DEMO_BLUEPRINTS`, `getBlueprint(state,id)`, `matchBuildingIdeas(text)`, `isValidBlueprint(record)`, `ownedBlueprintForSample`; `canPlaceBuilding(world,tileId,varieties,exceptId?)`, `buildingAtTile`. Actions CREATE_BLUEPRINT{sampleId,parentId?,requestId},CONSTRUCT_BUILDING{blueprintId,tileId},PACK_BUILDING{buildingId},RESTORE_BUILDING{buildingId,tileId},SELL_BUILDING{buildingId}.
- [x] Write RED tests for1/60/30economy,permanence,duplicate/sameresult/sourcechain,no-demo actions,all4supportcollision/terrain,mixedsupport,full4containerIDuniqueness,malformedrefs,checksum-first oldhydration.
- [x] Implement minimaltrustedcatalogue/sharedoccupancy/reducer/validator/defaults; target+fullGREEN.
- [x] Commit state slice for independentreview before UI.

### Task2: Dedicated diagram creation and collections
**Files:** src/ui.js,src/ui-state.js,src/app.js,styles.css; UI/controller tests.
**Interfaces:** separate panel blueprint-create, fixedoptionalparent, oneinput/one1crystalaction; buildcollection constructsownedblueprints; buildingbag restoresinstances; ownexhibitcontext pack/sell30/remix, demo remixonly.
- [x] Write RED tests separateentry/noplantchooser/unsupportednocharge/ownedreuse/fixedparent/contextownership/repeatedsubmit.
- [x] Implement conciseUI andatomicdispatch, keeping firsttap/focus/asyncgates; target+fullGREEN.
- [x] Commit testedUI slice.

### Task3: Personalexhibit rendering, fullfootprint preview and finalQA
**Files:** src/scene.js,src/scene-math.js,src/visual-walk.js,src/app.js; scene/placement/controller tests; README.
**Interfaces:** normalize personalinstances into existingworld.exhibits; construct/restoreghost usesbuildingPlacementPreview; supportedoutercorner forpersonalbuilding, existingterrainBFS unchanged.
- [x] Write RED tests plant+buildingplacementghost/anchor/support, exactpackrestorerenderidentity andnonblockingdirectcontrols.
- [x] Implement rendereradapter/minimalpreview/standpoint, verify fulltests/check/build and no privateassets.
- [x] Commit coherentcandidate and request parentwholebranch/nativeQA; no publish.
