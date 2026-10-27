# Direct harvest sale

Latest user request: 种植→收获 supports selling the exact saved whole-plant instance without restoring it first. Use the same trusted catalogue price/maturity/sales-unlock convention as on-ground sale. No building sale; paid demolition remains separate.

`SELL_PACKED_PLANT{plantId}` resolves only plantBag, rejects missing/stale/on-ground/demo/growing instances atomically, credits once and removes exactly that ID. Preserve every other instance, author/provenance, seed inventory, claims and crystals. Check local counter capacity before mutation so successful transactions remain save-valid. Legacy growing bag specimens stay intact and disabled until mature.

UI shows the exact value, current harvest count and immediate balance/list updates via the existing dispatch/render/save coordinator. Tests cover repeated no-credit, same-variety neighbors, exact readyAt boundary, failed atomic state, save roundtrip and actual controller persistence. No namespace/schema changes.
