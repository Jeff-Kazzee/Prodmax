# T-002 — M3a Issues API + services

status: done
module: M3 issues engine
assignee: Cursor Grok 4.6 — 2026-08-18
owns: src/pages/api/issues/**, src/pages/api/comments/**, src/pages/api/views/**, src/pages/api/undo/**, src/lib/services/issues*, src/lib/services/comments*, src/lib/services/views*, src/lib/validation/issues*, src/lib/validation/views*, tests/api/issues*, tests/api/views*
depends-on: —

> Read `planning/tickets/README.md` first. The FULL Drizzle schema for all
> M3 tables already exists (src/db/schema.ts) — do NOT touch src/db except
> if a migration gap is found (report it instead if ambiguous).

## docs-to-read
- architecture.md §2.3 (issues spine), §2.5 (views), §2.10 (identifiers,
  positions, FTS5), §3.4 (endpoint list), §4 (filter DSL), §7 (permissions)
- ux-spec.md §4.7–§4.13 (screens that will consume this API)
- AGENTS.md (error shape, conventions)

## Deliverables

All 15 endpoints from architecture §3.4, service-layer + zod-validated,
workspace-scoped (scopedQuery rule), following the post-0333f15 endpoint
pattern: `export const POST = route(async (ctx: { request: Request; params?: Record<string, string | undefined> }) => …)` — look at any existing
`src/pages/api/**` file for the exact shape.

- Issues CRUD: GET/POST `/api/issues`, GET/PATCH/DELETE `/api/issues/:id`
  (cursor paging `?limit=50&cursor=`, `?expectedVersion=` → 409 on conflict;
  soft-delete; identifier allocation via the existing team_counters
  transaction; FTS triggers already exist — verify they fire).
- POST `/api/issues/bulk` (batch property edits, one undo token),
  POST `/api/undo/:token`.
- POST `/api/issues/:id/move-team` (new number, issue_redirects row).
- Relations + subscribers + history + description-versions endpoints.
- Comments: GET/POST `/api/issues/:id/comments`, PATCH/DELETE
  `/api/comments/:id` (mentions rows per schema).
- Views: GET/POST `/api/views`, GET/PATCH/DELETE `/api/views/:id`,
  POST `/api/views/:id/favorite` (filter AST §4.2 compiled to parameterized
  Drizzle fragments — NEVER string interpolation; max depth 3).
- Issue create response includes a `suggestions` field (empty for now —
  dedup lands in T-011/T-012; reserve the shape).
- Emit-nothing note: the event bus does not exist yet (T-016); structure
  services so an event emit can be added later without rework (single
  mutation choke-point per entity).

## Acceptance
Vitest suites in tests/api/ (use the existing helpers: real Request
objects, tmp DB per test). Cover: CRUD + 409 version conflict, identifier
allocation (PRO-1, PRO-2…), move-team + redirect, relations incl. blocking
inverse + blocker-resolution downgrade, bulk + undo, history ledger with
3-min grace fold, description version snapshots, views CRUD + favorite +
filter compile (field/op/value + and/or/not depth 3 + injection attempt
rejected). All four gates green.

## Work log (2026-08-18)

- Files: `src/lib/validation/{issues,views}.ts`; `src/lib/services/{issues,issues-*,comments,views}.ts`; `src/pages/api/{issues,comments,views,undo}/**`; `tests/api/{issues,issues-more,views}.test.ts`.
- Tests: +10 API cases (CRUD/409/PRO-1…2, move-team+redirect, blocking inverse + resolve→related, bulk+undo, 3-min history fold + description coalesce, comments mentions, views+favorite, filter depth-3 + injection rejected). FTS insert trigger verified on create.
- Gates: `npm run check` 0 errors / 0 warnings / 6 pre-existing hints; `npm test` 95/95; `npm run build` clean; `npm run e2e` 6/6.
- Deviations: no drizzle table for undo tokens (schema owned by M1). Runtime `CREATE TABLE IF NOT EXISTS undo_tokens` in the bulk service. Event bus still a no-op choke-point (`recordIssueMutation`) for T-016.
