---
name: Paintshop CRUD safety
description: Safe deletion and archive policy for Paintshop master and operational records.
---

Admin CRUD must protect historical and operational references: hard delete is allowed only when an entity has no dependent prices, stock movements, serials, paint usage, or job mappings; otherwise the UI uses deactivate/archive and the API returns a conflict with an audit entry for successful mutations. Customers are Admin-managed master records; new jobs select an active customer, and a customer already linked to a job cannot be renamed.

**Why:** Paintshop costs, stock balances, serial traceability, and customer-level order history depend on these records remaining stable.

**How to apply:** Keep Admin-only authorization on every mutation, require deactivation before destructive UI actions where practical, and protect self-deletion and last-active-admin removal. Create or activate a customer before assigning it to a new Job Number.