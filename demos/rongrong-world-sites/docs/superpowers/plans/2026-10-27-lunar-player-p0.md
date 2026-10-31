# Lunar visitor player/interactions P0

Base: published v35 source 497f2e94. Work isolated from local r4, playground and motion research.

Confirmed reproduction: actual five approved GLBs + actual LX + VisitorFarm canvas ray/PointerEvent click at grid (2,3) from spawn (1,3). Canonical move accepts, but World rejects its route because character-to-tile projection blocks16 complete2m cells. Player visibility is true. Other directions work, so this is not a global pause claim. Visitor also omitted failed walk feedback.

Bounded design:
- Replace only temporary showcase player navigation with exact world-space body envelopes plus player clearance; retain canonical terrain/shop/pond/egg/prop segment rules. Dynamic changes replan safely or stop with feedback; never teleport or persist these envelopes.
- Remove always-on portrait/action dock. Canvas character selection reveals a compact closable menu; empty ground dismisses and still walks. Loading/failure status/retry remains reachable, automatic character-labelled silent speech remains visible without selection.
- Use existing approved large actions more frequently, staggered by actor; chicken prefers dribble with limited runs/rest/wander. Preserve manual rest, hidden pause, carry and both new actions' bounded natural completion.
- Separate BGM owner's parent/audio patch; pending real identities are not guessed. No new GLB or formal economy/schema changes.

Verification: actual player canvas positive path, full route collision and dynamic obstacle checks; open/close/retry/late-focus UI; baseline/full ordinary+DOM/type/full lint/build; actual autonomous cadence metrics; independent final bounded review before official source/local package.

Second independently isolated input cause: the exact southwest ground ray at(0,3.5) hit a tile, but the overview's44px small-actor assist expanded beyond the dog's actual projection and changed it into character selection. Lunar-only assistance is now contained within the actual projected body bounds; ordinary animal44px assist is unchanged.

Focused actual canvas trials now walk1.322/1.300/1.600/2.236m in four available directions and return to spawn through normal movement; the original east click then walks2m with minimum0.429m reserved-body clearance. Actual skin selection opens a nonmodal menu; one ground click closes it and starts walking. Explicit load/retry and unselected speech remain.

New opening camera reserves176px for a compact selected menu rather than220px always-on dock and frames initial actor/court bounds, not unused far terrain. Full actual five skins + hoop mesh bounds checked on390×844,360×640,1280×720,1440×900. Camera is user-draggable and follows ordinary player motion; this is CPU projection, not device visual acceptance.

No GLB, account/authority/backend/DB format or action-completion capability changed. Large existing actions are preferential; model amplitude itself is not reauthored.
