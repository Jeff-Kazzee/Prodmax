# T-003 — M3b Issue views UI (list/board/table/filter/views)

status: open
module: M3 issues engine
assignee: —
owns: src/island/features/issues/**, src/components/issues/**, edits to src/island/app/routes.ts + src/island/app.tsx (route swaps only), tests/island/features/issues*
depends-on: T-002

> Read `planning/tickets/README.md` first. Swap ScreenPending for real
> screens: `/issues*`, `/team/:teamKey/*`, `/v/:viewId`, `/my-issues`
> (R-09/R-10/R-12/R-14/R-19 layouts). Sidebar team links go live (edit only
> the link targets in src/island/components/shell/teams-section.tsx — shell
> files otherwise M2-owned; coordinate via work log).

## docs-to-read
- ux-spec.md §3.0 (shared contract), §4.7 (S-07 list), §4.8 (S-08 board),
  §4.9 (S-09 table), §4.10 (S-10 filter bar), §4.11 (S-11 saved views), §6
- design-system.md §4 (density vars), component specs for rows/cards/menus
- architecture.md §4 (filter AST — the `?f=` round-trip), §9 perf budgets

## Deliverables

- **S-07 list**: sticky filter bar; group headers (collapse persists per
  view, count⇄points toggle, drag-to-apply property); rows open `?issue=`
  panel links (panel itself is T-004 — rows emit navigation only); inline
  property editors (L-03) optimistic; selection X/Shift/Cmd+A persisted
  across pages; bulk bar w/ single undo token; manual reorder drag +
  Alt+arrows; sub-issue expander; virtualized ≥500 rows (windowing, no
  external dep needed — see perf budget §9), cursor sentinel fetches 50.
- **S-08 board**: drag = PATCH + 4.5s undo toast, spring settle; keyboard
  J/K cards, arrows cross columns, Shift+arrows move; column "+" prefills
  state; WIP advisory dots.
- **S-09 table**: frozen mono ID column, cell editors Enter/Tab commit,
  Esc revert; header sort asc→desc→off; column visibility/reorder per
  view; APG Grid pattern.
- **S-10 filter bar**: chips property+operator+value click-to-edit; `F`
  quick-filter, Shift+F clear (undoable); advanced and/or chrome ≤3 depth;
  live mono count; every AST change round-trips `?f=`.
- **S-11 saved views**: unsaved-change dot; save-as dialog
  (name/scope/layout/favorite); `/v/<id>` share URLs; favorites → sidebar
  section (wire to SB-03 slot); view identity menu.
- Optimistic UI per §3.0: local apply ≤16ms → fetch → reconcile; rollback
  + ERR-std toast on error.

## Acceptance
RTL tests: filter chip CRUD + `?f=` round-trip, grouping/collapse
persistence, virtualization window math, selection semantics, board drag
→ PATCH payload. All four gates green (e2e may add one spec: open a seeded
view, edit a filter chip, URL reflects it).
