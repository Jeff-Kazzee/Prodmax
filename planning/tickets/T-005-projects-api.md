# T-005 — M4a Projects/cycles API

status: open
module: M4 projects & cycles
assignee: —
owns: src/pages/api/projects/**, src/pages/api/project-updates/**, src/pages/api/milestones/**, src/pages/api/cycles/**, src/lib/services/{projects,project-updates,milestones,cycles}*, src/lib/validation/{projects,cycles}*, tests/api/{projects,cycles}*
depends-on: T-002

> Read `planning/tickets/README.md` first. Schema exists (projects,
> project_updates, milestones, cycles in src/db/schema.ts).

## docs-to-read
- architecture.md §2.4 (tables + progress caches + rollover), §3.5
  (endpoint list), §9 (materialized counter rules)
- ux-spec.md §4.15–§4.16 (consumers)

## Deliverables

All 11 endpoints from §3.5: projects CRUD (+ lead, target dates, brief
page link, color, position), project updates (health, progress_snapshot),
milestones CRUD, cycles list/create/patch, `POST /api/cycles/:id/scope`
(add/remove issues), `POST /api/cycles/:id/close` (freeze stats_snapshot,
rollover open issues to next cycle per §2.4).

- Materialized `progress_cache` / `progress_points_cache` maintained in the
  SAME service write that changes an issue's completed state (O(1) per
  write, never recomputed on read — §9 counter-design). This requires a
  small hook into the issues service from T-002: add it as a call from the
  issue completion mutation choke-point; if that file is outside your
  owns-list, add the hook via an exported registration function and note
  the amendment (or coordinate — T-002's services were structured for
  exactly this).
- Cycle status derived+stored per §2.4; team-scoped UNIQUE(team_id,number).

## Acceptance
Vitest: project CRUD + progress cache updates on issue completion + O(1)
(no full scans — assert query count via prepare counting if practical),
update cadence + snapshots, milestone ordering, cycle create/scope/close +
rollover + stats freeze. All four gates green.
