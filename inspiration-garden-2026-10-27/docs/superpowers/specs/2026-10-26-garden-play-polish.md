# Garden Play Polish — post-v10

Baseline6c6a598/v10 is delivered and frozen. User requested four bounded improvements; parent owns publication, artist owns worksite art/facing audit. Existing193tests, economy, provenance, safe-save namespace and oldmanor remain protected.

## Building-example dice
One 🎲 button beside the building idea input fills (never submits) exactly one supported sentence: 把三花猫变成一座会呼噜的书屋 / 用狗狗和露营帐篷造一个小工坊 / 把朋友的眼镜和围巾变成钢琴排练亭. Consecutive rolls do not repeat. Fixed-parent remix excludes its identical sample. Filling clears stale error/reuse state, retains first-tap/keyboard safety. Empty submit differs from unsupported and points to🎲. No samplegrid or plantdice expansion.

## One seed tab
Bag has only种子/植物/建筑. The seed tab includes all knownavailable varieties, positive stockfirst withdirectplant; zerostock below says暂无种子, not已用完. Detail/author/parent/remix reachable. Zero-stock basics/personal creations maybuywithcoins; friend-only varieties route to示范花园. Lockedfuturebasics/undiscoveredart stayhidden/sealed. No data deletion/migration.

## Construction work
Newland/platform/fence/wall:3seconds. Newpersonal2×2building:15seconds. Reserve coordinate/edge/footprint and chargeonce atstart. Optionalpaired startedAt/readyAt saveonce, progressderivedfromwallclock; no framewrites, completionreward or refreshcharge. Missingtiming onlegacyitems meansfinished.

Pendingtiles cannot supportplants/buildings/edges orwalking; newtiles attachonlycompletedterrain (no unfinishedfoundationchains). Pendingitems cannotmove,reclaim,pack,sell orplayasfinished. A supporttile withunfinishededge cannotmove/reclaim thatedgeindirectly. Fullisland AND completed-walkinggraph muststayconnected onmove/reclaim; avatar staysoncompletedterrain. Pendingpersonalbuilding reservesall4cells immediately. Restore/movecompletedassetsretainoriginaltiming andneverrestartpaidwork.

Genericprocedural soil/assembly progressforbasics; artistgeneric2×2scaffold forpersonalbuildings, withproceduralfallback. Workcontextshowsprogress/countdown untilfinished; directcontrols onlyaftercompletion. UI-only clockrefresh mustnotwrite saves.

## Facing
Auditactualnew2D sprite orientations againstiso screenvectors, all4diagonals; correctfront/back/mirror mapping ratherthanblindglobalflip. Preserve380ms whole-routeeasing/BFS,stableIDs/sourceframes/anchors andnatural directionchanges.

## Acceptance
FocusedTDD commits; independenttimermodel/state review, fulltests/check/build, parentnativeQA. Existingtestsadapt explicitelapsedtime whereinstantconstruction was superseded, neverremoved. Workerdoesnotpublish ormessageuser.
