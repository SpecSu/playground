# School walking correction — v37 follow-up

The user explicitly rejected observer mode. This supersedes the earlier observer camera/UI decisions, not the reviewed eight-runner GLB.

- Real existing `human-lx`, same `.65` scale, same `advancePlayerMotion` and `farmLocomotion`/`FarmAvatarPose` as ordinary visitors. `.5` logical cells/s ×2m/cell =1m/s, including the same .187s acceleration; no new slow-showcase speed.
- Real canvas ground pointer commands a local route. The camera follows LX, not the squad. No free-observer toggle, no stand-in player, no canonical tiles or account service.
- Individual actual solid mesh footprints below player height, not whole scene/group/roof bounding boxes. Track/field/paint stay walkable. Player circle `.42m` conservatively covers measured real normalized LX footprint `.267071m`; runner circle `.45m` covers the unchanged reviewed run envelope.
- Dynamic navigation uses current real runner circles. Group movement commits only if the relative swept runner/player segment is safe; otherwise the formation temporarily yields. Never reserve an uncommitted future runner circle as permanent player occupancy (this caused a reproduced deadlock and was corrected).
- Actual canvas tests cover four directions, empty track crossing, standing on a lane, squad yielding, retreat/detour and eventual destination arrival, then squad resumption. All input projections are inside the canvas. Southern escape moved from z5.9986 to z2.4690 in5s around the real circles, then reached the target; independent reviewer reproduced and closed the north-lane counterexample too.
- Runner selection opens the compact menu. Nearby `打招呼` animates the real LX right arm using the existing greeting rig; no runner transfer, sale, breeding, model replacement or reward. Stable IDs unchanged; display label is now 豆包.
- Hidden/modal/blur/context-loss cancel player route/gesture and rebase clocks. Group pause does not disable the player's local movement. LX failure is a visible failure even if eight runners have loaded; retry/late teardown stays scoped.

Checkpoint verification:20/20 focused ordinary (including real public run binding),11/11 focused actual React/World tests; typecheck, explicit full-source lint and build pass. Full ordinary rerun was launched separately; the existing source-pin manifest is intentionally left to main's combined release refresh. CPU Three/GLB only, no browser/GPU or performance claim. Sole combined reviewer owns final acceptance after integration.

Additional fail-closed regression: with valid real LX but deliberately corrupt run bytes, the actual ground pointer previously accepted a route using invisible runner-frame circles. `walkTo`, nearby greeting and frame movement now all require the combined ready state. Actual canvas RED→GREEN plus App/home/retry/walk/greeting7/7, typecheck and focused lint passed; no collision threshold or asset was changed.
