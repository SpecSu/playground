# Creative-obstacle integration verification

Upstream input: exact frozen social partner-card source `dcadd3d68d612a5961e8e7141d4b4717b27316a3`, byte-identical to verified card candidate `e13538ca682b6280053231fed4ad7e404a76d569`. Publication is separately controlled by the release owner.
Verified business source: `01b1e66b18069047d5f54b1900704270919b6028`.
The collision source and its tests exactly match reviewed owner commit `fd7f09134e8e387e04d72c4662969bf20735282f`; existing social UI remains unchanged. This evidence and source-hash refresh follow the business commit.

## Narrow consistency fix

Canonical ground props and custom eggs now derive a bounded spatial projection from the existing creative asset list; there is no second ownership store. Reads, timeline advancement and canonical writes regenerate it. Imports discard the derived field while retaining the original snapshot fingerprint.

Player/animal movement, egg placement, creature arrival and creative placement/hatch share that context. New props cannot overlap current actor bodies or sever reachable dry-land routes, including routes constrained by ordinary eggs. Existing overlapping actors can leave continuously without being deleted or relocated. Picking up a prop or egg advances the old layout first, then removes its obstacle, preventing old-time replay.

Actual World correction routes avoid newly placed props at the existing bounded speed. New blockers stop the player at the current fractional position, not a relocated grid point. Existing canonical locks, custom egg incubation, reserved boarding egg slots, social consent/card identity and pending-command handling are retained.

Example visitor decorations remain a separate out-of-field layer: all 12 real theme meshes have a measured minimum 0.3405621178 world-unit gap from owned land. Actual visitor session/World tests reject off-farm destinations and placement commands without changing home bytes. This does not claim arbitrary in-field example decorations are collision-managed creative assets.

## Fresh combined verification

- Full ordinary suite: **927/927**, no skips.
- All actual React/World CPU DOM suites: **88/88**, no skips. This combines the existing social card, custom egg, slow-ACK, visitor, canonical lock and boarding tests with the four actual obstacle/visitor World tests.
- Typecheck, explicit full source ESLint, production build and whitespace check: exit 0.
- Protected Sites/source-pin tests after provenance refresh: **8/8**.
- The owner's read-only independent review passed **18 domain cases and three actual World cases**, then the additional actual sample-visitor case passed in both owner and combined full DOM runs. Reviewed collision source/tests match the integrated bytes.

No model bytes, schema/migrations, authentication, dependency, social UI or twenty-species WIP changed. This does not solve the separate pre-unlock terrain-landmark visibility issue. No browser/mobile GPU visual acceptance or hosted HTTP check is claimed; geometry and event evidence is CPU-based.
