# LX compact aloe and ordered beds

User asks specifically to replace spider-like fern with aloe and arrange plants neatly. No public release in this task.

Plan:
1. Keep immutable variety/art IDs and ownership/economy fields; change current fern presentation to compact upright sage aloe with thick leaves and low detail. Preserve old saved varieties verbatim.
2. Keep all existing supports and occupied cells, so all previously verified walkways and building entrances remain unchanged. Reassign four low-plant specimen positions into a three-aloe front border, a three-aloe facade strip, a paired rear strip and a single terminal planter. Gather pearl blooms around research equipment rather than alternating the main border. Use one consistent scale for each species.
3. Add regression tests that pin those straight rows, species sizes, compatibility IDs, unchanged other three gardens and landmarks, plus existing clear-route checks. Generate actual native Canvas diagnostics and run the full suite/check/build.
4. Parent reviews and owns any future public publication.

## Frozen implementation and compatibility

- Generated `assets/heroes/lx-aloe-v1.webp`: 400×355, 35,888 bytes, transparent, display width60, instance scale0.86.
- The canonical ID/artKey `lx_silver_biofern` remains stable. Current display name is 银序芦荟. The exact historical name 银序生物蕨 is accepted only for this art key; arbitrary names, creator/root conflicts, interactions and unsupported tariffs remain rejected.
- Presentation projects the current name, while stored historical records and raw save bytes are not rewritten. Existing one-per-variety daily seed cap remains shared before and after rename.
- `lx-silver-fern-bed-1` swaps its planting coordinate with `tech-low-bed-fill-4`; `lx-silver-fern-bed-4` swaps with `lx-orbital-bed-east`. No occupancy, terrain, landmark, spawn, entry or interaction stand changes.
- Other three garden objects are hash-pinned unchanged. Full suite:730 tests;55 syntax modules;164 runtime files. Real `createScene` native Canvas diagnostics inspected at overview, mobile and max zoom. Parent owns browser QA/publication.
