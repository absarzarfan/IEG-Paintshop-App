---
name: Legacy database constraints
description: Historical PostgreSQL constraint names in the Paintshop database must match the Drizzle schema.
---

When changing unique constraints in the Paintshop schema, inspect the existing database constraint names and preserve them explicitly in Drizzle. Otherwise, schema push may interpret a naming mismatch as a table replacement and ask to truncate existing rows.

**Why:** The existing database was created with legacy constraint names that differed from Drizzle's generated defaults; matching the names made the additive schema push safe.

**How to apply:** Before schema changes, inspect `pg_constraint`/`information_schema` when push proposes truncation or table replacement. Abort and resolve the mismatch; never force the push.
