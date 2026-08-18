# T-006 — M4b Projects/cycles UI

status: open
module: M4 projects & cycles
assignee: —
owns: src/island/features/projects/**, src/island/features/cycles/**, edits to src/island/app/routes.ts (route swaps only), tests/island/features/{projects,cycles}*
depends-on: T-005, T-003

> Read `planning/tickets/README.md` first. Swaps: `/projects` (R-17),
> `/project/:id` (+/board /list R-19), `/cycle/current` (R-20),
> `/cycle/:id` (R-21).

## docs-to-read
- ux-spec.md §4.15 (S-15 project overview/list/board), §4.16 (S-16 cycles),
  §3.0 shared contract
- design-system.md chart/token specs for progress + charts

## Deliverables

- **S-15**: projects list (grouped by status, reorder); project overview —
  header (lead, target, health from latest update, progress bar from
  progress_cache), tabbed Issues (embeds the T-003 view engine scoped to
  the project), Milestones, Updates timeline (post update with health
  picker + progress snapshot); board/list reuse the view components with a
  project filter locked on.
- **S-16**: current cycle header (dates, progress, scope chart), issue
  scope add/remove (search picker), close-cycle flow with rollover
  preview; cycle list/History nav.
- Sidebar "Projects" + "Cycle N" links live (log any shell edits).

## Acceptance
RTL: overview renders cached progress (no issue scans on read), update
posting, cycle scope/close flows. All four gates green; e2e: create
project → add issue → complete it → progress bar moves.
