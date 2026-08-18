# T-007 — M5a Docs API (pages/blocks/templates/search)

status: open
module: M5 docs engine
assignee: —
owns: src/pages/api/pages/**, src/pages/api/blocks/**, src/pages/api/templates/**, src/pages/api/search/**, src/lib/services/{pages,blocks,templates,search}*, src/lib/validation/{pages,blocks}*, tests/api/{pages,blocks,search}*
depends-on: —

> Read `planning/tickets/README.md` first. Schema exists (pages, blocks,
  templates in src/db/schema.ts; FTS5 infra in src/db/fts.ts + fts.sql —
  pages/projects triggers already synced; verify block text updates
  propagate to the pages row FTS).

## docs-to-read
- architecture.md §2.6 (pages & blocks — 19 block types + per-type
  contracts), §2.7 (templates), §2.10 (positions/path), §3.6 (endpoints),
  §9 (the one-query page open counter-design)
- ux-spec.md §4.17–§4.18 + §5 (consumers)

## Deliverables

All 10 endpoints from §3.6:

- Page tree: GET `/api/workspaces/:wsId/pages/tree` (visible nodes only,
  materialized path, O(expanded)); page CRUD + restore (trash 30-day);
  move = path rewrite + depth cap 20 + cycle detect.
- Blocks: GET `/api/pages/:pageId/blocks` = ONE ordered query
  (page_id, deleted_at IS NULL, ORDER BY parent_id, position) — client
  builds the tree, no recursion (§9); POST create; PATCH single (props,
  position, parent — nest rules per type); DELETE soft; POST
  `/api/pages/:pageId/blocks/batch` (paste/drag-multi, one transaction);
  every write updates the page's extracted FTS text.
- richText sanitize: allowed marks only; link schemes http/https/mailto;
  mention nodes validated against workspace members.
- Templates: CRUD + `POST /api/templates/:id/instantiate` (issue kind →
  prefilled issue payload; page kind → blocks tree clone).
- GET `/api/search` over src/db/fts.ts (entityTypes filter, cursor-safe).

## Acceptance
Vitest: tree query shape (single SELECT — assert via prepared-statement
counter), block CRUD + batch atomicity + nest-rule enforcement, sanitize
cases (bad scheme, unknown mark, non-member mention), path rewrite +
depth/cycle rejects, trash/restore, template instantiate, search ranking
sanity (title boost). All four gates green.
