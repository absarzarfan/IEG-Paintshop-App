---
name: OpenAPI codegen + typecheck gotchas
description: Three non-obvious failure modes in the pnpm-workspace OpenAPI-first pipeline (lib/api-spec -> orval -> lib/api-zod / lib/api-client-react) and how to fix each without touching orval config or generated files.
---

## 1. Missing `dom.iterable` breaks generated mutation hooks

Orval emits a `Headers`-merging helper (`Object.fromEntries(h.entries())`) inside every generated mutating endpoint (POST/PATCH/PUT/DELETE with a body). `Headers.entries()` / iterable methods are declared in the `dom.iterable` TS lib, not plain `dom`.

If a consuming package's `tsconfig.json` has `"lib": ["dom", "es2022"]` (missing `"dom.iterable"`), codegen output fails to typecheck with `TS2339: Property 'entries' does not exist on type 'Headers'` — but only once the OpenAPI spec has at least one mutating endpoint, so this can pass silently on a read-only first spec and only surface later.

**Fix:** add `"dom.iterable"` to that tsconfig's `lib` array (e.g. `lib/api-client-react/tsconfig.json`: `"lib": ["dom", "dom.iterable", "es2022"]`). Do not touch orval config or generated files.

## 2. `format: date` / `format: date-time` fields become JS `Date`, not `string`

Orval generates `zod.coerce.date()` for any OpenAPI field with `format: date` or `format: date-time` in the `lib/api-zod` package (server-side runtime validators). This means `SomeBody.safeParse(req.body).data.someDateField` is a real `Date` object at runtime and in its TS type — even though the OpenAPI schema says `type: string, format: date` and the frontend's plain TS types (from `lib/api-client-react`) still say `string`.

Practical effect: if a Drizzle column backing that field uses `{ mode: "string" }` (e.g. a `date(...)` column), inserting the coerced `Date` value fails to typecheck (`Type 'Date' is not assignable to type 'string'`). This is exactly how `createdAt`/timestamp columns already behave everywhere in the codebase (drizzle `timestamp` returns `Date`, matching `zod.coerce.date()` — which is why those never broke) — a `date`-typed column is the odd one out unless its mode matches.

**Fix:** give that Drizzle column `{ mode: "date" }` (not `"string"`) so the JS-side representation is `Date` end-to-end, matching every timestamp column's pattern. Postgres storage stays a date-only column either way; only the JS/TS representation changes. On the wire, responses still serialize as ISO strings (`JSON.stringify(Date)`), just with a full timestamp rather than a bare `YYYY-MM-DD` — acceptable and consistent with how `createdAt` fields already round-trip.

## 3. `tsc -p <pkg>/tsconfig.json --noEmit` reads STALE lib output after editing a lib package

Packages under `lib/*` (e.g. `@workspace/db`) are composite TS projects with prebuilt `dist/*.d.ts`. When an artifact package's tsconfig references a lib package via TS project references, running `tsc -p tsconfig.json --noEmit` directly (not `--build`) does **not** rebuild the referenced lib project — it just reads whatever is already in that lib's `dist/`. Editing lib source (e.g. adding new Drizzle schema files/exports) without rebuilding produces misleading `TS2305: Module has no exported member` errors in the consumer, even though the export clearly exists in source.

**Fix:** after any change to a `lib/*` package, run the workspace-root `pnpm -w run typecheck:libs` (`tsc --build`, which rebuilds all composite lib projects in dependency order) **before** typechecking a consumer package (`artifacts/*`). Re-run it again any time lib source changes, even mid-session.
