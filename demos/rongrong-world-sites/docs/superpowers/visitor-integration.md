# Integration contract: sample friends

Exports:
- `FriendsPanel({onVisit:(BoardingTarget)=>void,onClose:()=>void})`
- `VisitorFarm({sampleId:string,onHome:()=>void,onFriends:()=>void})`
- `VisitorSession` is an in-memory **display** capability adapter, not an AccountClient.

MinimalApp integration (owner: runtime integrator):
1. Add a Friends entry and separate `visitingSampleId`/`friendsOpen` UI state. Never put the sample state into `data`, `live`, session, save guard, Atlas or durable outbox.
2. Before entry, cancel all home pending interaction/arrival/approach intents, clear held UI lock and close sheets. Do not enter while an economic command is pending without settling/canceling its UI intent.
3. Keep the home World and authoritative session mounted. Hide and inert its UI/host; call `world.setPlayerMotionVisible(false)` (this already cancels RAF). Home async results may settle home state only, never visitor state.
4. Mount one VisitorFarm overlay. When a sample changes, VisitorFarm disposes the previous World, invalidates action intents and recreates only its own in-memory state. It imports no provider registration/preparation and uses only existing five released legacy animal models.
5. On Home unmount VisitorFarm and restore visibility to the existing home World; do not call home focus/reconcile teleport or replace its camera. The document visibility callback must NOT wake the home World while a visitor is open.
6. `onVisit({kind:'real',uid})` is a different future route. Do not coerce sampleId to UID. Present cards are explicitly all examples.

World change is only an owned, disposed SampleScenery root; it changes no existing motion/timeline code. Sample scenic GLBs load through their own existing HunyuanEnvironmentScene instance. Visitor disposal must leave retained home's shared GLB cache/materials alive (CPU test asserts this).

CPU tests: `node --experimental-strip-types --import ./tests/view-loader.mjs --test tests/minimal-friends.dom.mjs` uses the existing network-motion fixture and actual World/GLB bytes. It needs the already installed optional `work/cpu-deps` happy-dom environment. No browser or GPU inspection is claimed.

## Sample boarding demo
`VisitorFarm` now accepts optional `viewerKey` (pass `session.account.uid`, or a stable local-account key). It creates a component-owned `createSampleBoardingAdapter` per key. There is no cross-user singleton or localStorage. All participants are synthetic sample/demo IDs, not copies of formal animal IDs. Explicit consent, simulated friend acceptance, cancellation and demo-only fast-forward are available in the visitor's `寄养演示` panel. It does not import/use AccountClient or the real boarding service. `SampleBoardingPanel` protects sample switches, unmounts and command-vs-poll races with generation and request-order guards.

## Implemented App attachment
The runtime integrator delegated MinimalApp to this branch. The App now mounts the drawer/visitor and keeps its home layer inert and visibility-hidden (not unmounted). Both its RAF visibility callback and 250 ms presentation tick check `visitingRef`. Entry rejects pending canonical commands; opening the drawer cancels existing approach/arrival intent. A direct home command/select/arrival cannot run while visiting. The real boarding entry mounts the separately-owned BoardingPanel; sample IDs never reach it. All canonical projection/timeline call sites now use `canonicalFarmLocks` so real boarding locks and wishing locks both remain respected.

Additional CPU integration command:
`node --experimental-strip-types --import ./tests/view-loader.mjs --test tests/minimal-friends-app.dom.mjs tests/minimal-friends.dom.mjs tests/minimal-network-motion.dom.mjs`

Measured App scenario: delayed canonical move refused entry, old arrival could not revive pickup, a late GET settled only home; hidden→visible event kept home paused; return retained its canvas/camera/zoom. Home camera delta 0, coins 777, one original formal animal, zero formal pickups. No browser/GPU claim.
