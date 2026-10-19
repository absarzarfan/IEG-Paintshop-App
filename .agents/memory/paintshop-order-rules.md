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
