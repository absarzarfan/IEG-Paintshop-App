# Memory Index

- [OpenAPI codegen + typecheck gotchas](openapi-codegen-typecheck-gotchas.md) — dom.iterable tsconfig requirement, Date coercion on format:date fields, and stale tsc project-reference builds in this pnpm workspace template.
- [Paintshop authentication](paintshop-authentication.md) — internal username/password sessions are Admin-provisioned; no provider or email identity is required.
- [Paintshop role compatibility](paintshop-role-compatibility.md) — Paint Mixer uses the existing `painter` database identifier until a deliberate migration.
- [Paintshop CRUD safety](paintshop-crud-safety.md) — delete only unreferenced records; deactivate historical records and protect the last Admin.
- [Paintshop serial identity](paintshop-serial-identity.md) — enforce uniqueness by JN + SN, not by SN alone.
- [Legacy database constraints](legacy-database-constraints.md) — preserve historical unique-constraint names or schema push can propose destructive table replacement.
- [Order and shipment rules](paintshop-order-rules.md) — whole-order targets, progress-adjusted material savings/overruns, and Admin-designated leader verification.
- [Paintshop stock allocation](paintshop-stock-allocation.md) — usage snapshots material/lot attribution; approved demo deletions return outstanding consumption before removing work history.
- [Paintshop PIC attribution](paintshop-pic-attribution.md) — PIC stays separate from the recorder; efficiency allocates target by shift progress and labels estimates.
- [Paintshop dashboard scope](paintshop-dashboard-scope.md) — keep operational monitoring visible to every authenticated role; leave audit history in its dedicated page.
- [Paintshop form selectors](paintshop-form-selects.md) — native controlled form fields avoid a signed-in Radix hidden-select runtime failure that reproduces across versions.
