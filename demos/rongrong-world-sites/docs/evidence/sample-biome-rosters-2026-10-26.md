# Sample farm biome rosters

Base: published v31 `a91d765c38a8bd7c1c546c2b757837ca6b4f1802`.

## User correction and implementation

The desert, glacier and wetland samples should not repeat the same animals. Use the existing admitted runtime species and the game's existing `egg-catalog.ts` biome mapping; do not admit paused candidates, recolor another animal, or invent missing assets.

| Sample | Actual roster | Placement |
| --- | --- | --- |
| oasis / desert | 3 alpacas, 2 rabbits | Alpacas on the dry oasis/sand route; rabbits on the small green oasis strip, not the shop |
| glacier | 4 penguins | Dry ice shore cells, not deep water; no initial grass-eating pose |
| forest / wetland (stable legacy sample key) | 4 ducks, 1 cow | Ducks around the pond/creek bank; cow on the green bank |
| lunar | Unchanged: ordinary sheep and rabbit | Six DIY GLBs remain explicitly pending, not represented by fake animals |

Alpacas are the already-published game's desert roster, not a claim that new camel/desert-fox models exist or a claim about real desert biology. No new model, API, prompt generation or asset admission is included. Real friend identity binding remains pending.

All new bodies still use the existing current scoped provider and actual GLB validation. No provider, admission, formal catalog, World movement, home state, outbox, terrain or economy code changed. Missing main-species resources remain invisible, display a short explicit pending-model notice, and cannot be greeted or picked up through the UI or direct visitor command. Sample boarding remains a separate nontransferable demo realm.

## Verification

- RED: exact roster expectations failed against v31's repeated legacy animals.
- RED: direct care could previously succeed for a missing-resource identity; the visitor-only runtime guard now rejects it.
- RED: actual World missing-model test lacked a truthful species-specific pending notice; now green.
- 16 focused ordinary tests pass, including actual approved bytes, dry-foot/body placement, care/pickup/putdown, switch/dispose, command whitelist and isolated demo boarding rewards.
- 96 full React/World CPU DOM tests pass. New coverage loads 18 real actor instances through four visits, checks each species' skin and approved main-model hash, and observes `storageWrites=0`, `homeDisposed=0`, `homeCameraDelta=0`. Live provider object identities remain unchanged after all visits.
- Typecheck, full lint and build exit 0. Full ordinary suite has 947 tests; the only expected failure is the existing source-sync manifest hash, deliberately left for the integrator to refresh together with their separate change. All other 946 tests pass.
- Existing actual GLB scenery perimeter regression remains green: 16 mesh roots, minimum owned-land clearance `0.3974122654510559`.

This is CPU/data/actual-GLB evidence, not browser/GPU visual or mobile-performance acceptance. No publication performed by this branch.
