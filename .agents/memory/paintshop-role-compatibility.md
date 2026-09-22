---
name: Paintshop role compatibility
description: Compatibility decision for the three-role transition while Clerk migration remains deferred.
---

The application exposes three active roles to users: Admin, Paint Mixer, and Warehouse. The existing database identifier `painter` is intentionally retained as the internal identifier for Paint Mixer until a deliberate data migration is approved.

**Why:** Existing development data and session/auth code already use `painter`; renaming the enum immediately would add migration risk without improving the current workflow.

**How to apply:** Keep user-facing labels and API documentation aligned to Paint Mixer, while treating `painter` as the compatibility value in role checks and database records. Revisit this decision only as part of the Clerk/authentication migration.