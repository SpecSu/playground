# Personal Four-cell Building Loop

This is a separate expansion after publishedv8, not part of the unfinished avatar-only delivery. User identified the missing personalized-building construction loop and authorized closure. Existingplant creation, economy, namespace, originals and currentart remainunchanged except this explicitbuildingloop.

## Entrance / one clear choice
建造 → 创造图纸 opens a dedicated one-idea input and explicit1水晶 confirmation. No plant/building mode chooser enters the existingplantcreationpanel. Three finite offline samples reuse currentportraitpavilion,calicoden,campworkshop art and fictionalAIexample photo sources. Clearcompactdisclosure: no arbitraryliveAI,realphoto orupload. Unsupportedtext spendsnothing.

A successful original or fixed-parent remix creates ONE permanent personalblueprint for1crystal, not a freebuilding. Each construction costs60coins and uses thatblueprint forever; reusedblueprint neverchargescrystals. Sameparentsample is not a paidremix; an alreadyowned identicalsample offers existingblueprintconstruction instead of charging. Remix may choose a different one of the3authoredsamples (no newartvariation), preserving parent/root/originalauthor references. Own anddemo buildingcontext can open fixed-parent改造. Demoassets cannot be packed,sold or silently acquired.

## Minimal data / identity
Optional fields: `blueprints:{[id]:Blueprint}`, `buildings:BuildingInstance[]`, `buildingBag:BuildingInstance[]`. Blueprint stores only `{id,sampleId,authorId,authorName,parentId,rootId,parentAuthorName}`; names/art/interaction/sourcephoto/story and prices derive from a trustedimmutable3samplecatalogue. NewownIDs use existingnewId counter. CanonicaldemoblueprintIDs/authors are explicit and independent ofmutablelayout; existingexhibitIDs stayunchanged.

Instances store `{id,blueprintId,tileId}`. Blueprints live in the buildcollection; packedinstances live in a separate buildingbag tab. Pack/restore moves the exactsameinstance forfree. Optional sale removes aplacedinstance once for30coins; permanentblueprintremains. No crystalrefund,no auto-expansion, no duplicateinstance or repeatedsale reward.

## Shared spatial rules
Everypersonalbuilding needs all4cells of an axis-aligned2×2 footprint, northwestanchor, on connectedexisting land OR platform; mixedsupports allowed. Everycell must be free of plants,otherpersonalbuildings and authoredexhibits. Plantplacement likewise rejects anybuildingcell. Terrainmove/reclaim reject alloccupiedsupportcells, includingnonanchor. Invalidplacement is atomic: no coincharge, crystalcharge, autoexpansion or instancecreation. Preview clearlyshows fullfootprint and missing/blockedcells. Lowedge decorations retainexistingsemantics.

Personalbuildings use the same directexhibitcontrols and measuredsourceart. Owncontext adds pack/sell30 and quiet改造; demo keeps source/interaction/remixonly. Avatar uses supportedoutercorner/meaningfulheadfade forlargefootprints; no newcollision/navigationoverhaul.

## Save compatibility / safety
Sameversion/key. Raworiginal envelope checksum and legacy-schema validation happen BEFORE missingoptionaldefaults. No load-timewrite or rawheadchange. Validate allblueprints/instanceIDs/references as bounded ownstrings, derive costs/artcanonically; placed+packedplant AND buildingIDs unique acrossall4containers. Packedobsolete tileId doesnotreserve land. Existingrecoverycorrupt-bytearchive,WebLocks expectedhead,save-status/navigationguard remain. Newactions useexisting receipts forcreation idempotency; no newjournal/backend.

## Acceptance / staging
Purestate+storage TDD first, then minimalUI andrenderer integration; focusedcommits, fulltests/check/build and independentstate/economyreview. Parent decides whetheravatar-only update ships beforebuildingloop; no incompletefeaturefoldedintoavatarrelease. ParentnativeQA/publish, no workerdeployment.
