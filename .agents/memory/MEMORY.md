# Memory Index

- [OpenAPI codegen + typecheck gotchas](openapi-codegen-typecheck-gotchas.md) — dom.iterable tsconfig requirement, Date coercion on format:date fields, and stale tsc project-reference builds in this pnpm workspace template.
- [Paintshop authentication](paintshop-authentication.md) — internal username/password sessions are Admin-provisioned; no provider or email identity is required.
- [Paintshop role compatibility](paintshop-role-compatibility.md) — Paint Mixer uses the existing `painter` database identifier until a deliberate migration.
- [Paintshop CRUD safety](paintshop-crud-safety.md) — delete only unreferenced records; deactivate historical records and protect the last Admin.
- [Legacy database constraints](legacy-database-constraints.md) — preserve historical unique-constraint names or schema push can propose destructive table replacement.
