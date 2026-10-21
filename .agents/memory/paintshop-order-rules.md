---
name: Paintshop order and shipment rules
description: User-confirmed target basis, progress-adjusted material variance, and leader verification rules.
---

New JN targets cover the total ordered quantity, not one item. Customer reporting must combine multiple JNs while comparing actual usage to the allowance for completed progress, not just the full order budget.

**Why:** The user confirmed the whole-order basis and material-cost variance calculation. Their example is a 430 L order: consuming 420 L at 100% saves 10 L, but at 80% it exceeds the 344 L progress allowance by 76 L.

**How to apply:** Keep full-plan remaining liters separate from progress-adjusted savings/overrun. Describe monetary results as material-cost savings/overruns, not net sales profit.

Shipment verification is restricted to a Paint Mixer designated as leader by an Admin.

**Why:** The user explicitly selected the nominated-leader rule, rather than allowing all Paint Mixers to verify.

**How to apply:** Enforce the role and leader flag on the server, not only by hiding the verification button.

Paint Usage is recorded separately for each shift on an SN; shipment totals sum the actuals from all shifts.

**Why:** The user explicitly chose per-shift records so each handover preserves its own usage and history.

**How to apply:** Prevent duplicate records for the same SN and shift, keep stock movements attached to each shift record, and aggregate all shift records for shipment variance and cost.

Each active shift must record Paint Usage before handing over the job or completing it; a zero-liter record is valid when no paint was used.

**Why:** A handover without a shift record would omit that shift's consumption from shipment totals and could report a false saving.

**How to apply:** Enforce the requirement on the server for both handover and completion, and provide a direct link to the active job's Paint Usage form.
