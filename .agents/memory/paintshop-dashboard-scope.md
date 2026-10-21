---
name: Paintshop dashboard scope
description: Dashboard audience and separation from audit history.
---

The Paintshop dashboard is an operational overview for every authenticated role. Keep the audit history in its dedicated audit-log page rather than duplicating it on the dashboard.

**Why:** The user said the system already has an audit log and wants the dashboard used for operational monitoring instead.

**How to apply:** Keep the dashboard endpoint available to all authenticated roles and prioritize queues, live work, shipment status, and Paint Mixer presence over master-data counts or audit-feed entries.
