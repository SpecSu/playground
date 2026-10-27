# Paid personal-building changes

Latest user ruling: completed personal 2×2 buildings are not bag items or sale assets. Relocation costs20coins; demolition costs50coins. This supersedes prior pack/free-restore/sale behavior for new actions, not legacy data.

- `RELOCATE_BUILDING{buildingId,tileId}` requires an existing personal completed building,20coins and a different valid2×2 footprint on completed LAND/PLATFORM (mixed allowed). Exclude only that building from occupancy, permitting valid overlapping moves. Retain exact instance, blueprint and construction timestamps; charge once only after destination succeeds. Cancel/same/invalid/demo/pending/poor attempts change nothing.
- `DEMOLISH_BUILDING{buildingId}` requires an existing completed personal building and50coins. UI first shows the explicit cost and asks for confirmation; only confirmation invokes the transaction. Remove once, leave terrain/permanent blueprint untouched, no refund/resale/crystal change.
- Reject obsolete `PACK_BUILDING`/`SELL_BUILDING` transactions and remove their normal UI. New completed buildings cannot enter the bag.
- Preserve existing optional `buildingBag` and raw checksum/head protocol unchanged. Show a clearly labeled legacy-only recovery tab/notice only while leftovers exist. `RESTORE_BUILDING` consumes exactly that existing packed instance into a valid empty2×2 footprint for free, preserving identity/timestamps. Once returned it follows paid move/demolition, cannot be packed again. No migration/deletion/new legacy claims.
- Construction progress/pending guards, plant packing rule, terrain free movement/refunds, all other economy and selected-B/card/spacing changes remain unchanged. No hosting operations by implementer.

Implementation choices: inline demolition confirmation in the selected-house context; existing placement UI extended for paid relocation. No new modal system or schema fields.
