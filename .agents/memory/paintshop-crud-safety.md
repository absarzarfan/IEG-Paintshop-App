---
name: Paintshop CRUD safety
description: Safe deletion and archive policy for Paintshop master and operational records.
---

Admin CRUD must protect historical and operational references: hard delete is allowed only when an entity has no dependent prices, stock movements, serials, paint usage, or job mappings; otherwise the UI uses deactivate/archive and the API returns a conflict with an audit entry for successful mutations.

**Why:** Paintshop costs, stock balances, serial traceability, and audit history depend on these records remaining stable.

**How to apply:** Keep Admin-only authorization on every mutation, require deactivation before destructive UI actions where practical, and protect self-deletion and last-active-admin removal.