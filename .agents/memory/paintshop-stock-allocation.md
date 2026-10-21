---
name: Paintshop stock allocation
description: Rules for connecting Paint Usage, additional paint stages, and inventory cost history.
---

Every additional paint stage must be assigned its actual stock material. Do not infer the product from the stage name or coat category. Paint Usage snapshots that material assignment so later Job edits cannot silently change historical stock and cost attribution.

**Why:** Different stages such as second coat or touch-up may use different products even when they share a broad coat category. Guessing from the label can deduct the wrong inventory and misstate material cost.

**How to apply:** Keep the Job stage material, recorded-use snapshot, stock movement, and cost calculation aligned. Require available unexpired stock before recording usage; do not let stock go negative.

Stocktake records are append-only snapshots. Post a positive physical-count variance as `return_to_stock` and a negative variance as `out`, in the same transaction as saving the count.

**Why:** The user confirmed that stocktake differences should become ledger transactions rather than remain report-only.

**How to apply:** Calculate the variance from the locked current lot balance, preserve the before-count balance, and link the resulting movement to the stocktake record.
