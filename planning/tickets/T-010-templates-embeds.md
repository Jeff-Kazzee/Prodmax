# T-010 — M5d Templates + embedded issue views

status: open
module: M5 docs engine
assignee: —
owns: src/island/features/templates/**, src/components/blocks/issue-view*, edits to src/island/features/page-editor/** (slash menu rows) and src/island/app/routes.ts (swaps only), tests/island/features/templates*
depends-on: T-009, T-003

> Read `planning/tickets/README.md` first. Settings templates screens
> (R-41) render here too if trivial, else leave pending and log.

## docs-to-read
- ux-spec.md §4.18 (issue_view block rows), §4.17 (template gallery
  behaviors), §4.11 (view embed sync semantics)
- architecture.md §2.7 (templates incl. recurrence FM-054), §2.6
  (issue_view block contract), §3.5 view SSE sync note

## Deliverables

- `issue_view` block: bind a saved view by id; renders the T-003 view
  engine read/write inside the page (50/page cursor + windowing; "viewing
  as" chips for personal display layer); receives view.updated refresh
  once T-017 lands (poll fallback now, seam documented).
- Template picker in the editor slash menu (page kind) and the new-issue
  modal (issue kind — coordinate the T-004 seam: exported registration).
- Template editor dialogs: create from page/issue, edit data json via
  friendly forms (title/description/props for issues; block tree preview
  for pages), recurrence fields (FM-054) where applicable.
- Usage counters bump on instantiate (schema column exists).

## Acceptance
RTL: embed renders + paginates, bound-view switch, template instantiate
from both kinds, recurrence fields round-trip. All four gates green.
