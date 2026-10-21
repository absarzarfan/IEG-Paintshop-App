---
name: Paintshop PIC attribution
description: PIC identity stays distinct from the recorder; efficiency targets are allocated by progress gained per shift.
---

Select the PIC for each Paint Usage record from active Paint Mixer accounts. Keep the account that entered the record separately for audit history. Historical usage records remain unassigned unless a user explicitly edits and assigns them.

**Why:** the user chose Paint Mixer accounts as the PIC source because the person entering a record can differ from the person who applied the paint; old records must not receive guessed attribution.

**How to apply:** Keep new Paint Usage records tied to an active Paint Mixer account, preserve the recorder identity independently, and do not automatically backfill older records.

For PIC efficiency, allocate each serial's target liters by the progress gained during that PIC's shift. Reconstruct incomplete historical shift boundaries from workflow history, mark those scores as estimates, and leave shifts without positive progress unscored.

**Why:** the user selected progress-delta allocation to avoid assigning a whole-serial target repeatedly to each shift, and requested estimates be labeled when historical progress boundaries are incomplete.

**How to apply:** Compare a shift's actual liters with its progress-adjusted target, use the Paint Usage PIC for attribution, and show estimated/unscored counts beside the efficiency result.
