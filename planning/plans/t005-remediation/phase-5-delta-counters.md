# Phase 5: delta counters

Back to [overview.md](overview.md).

## Goal

A counter update becomes O(1) per write. The full aggregate leaves the write path
and survives as a named repair path.

## Blocked on

T-022 deliverables 2 and 3. Deliverable 2 amends §2.4's
`progress_points_cache` note to the four-field shape. Deliverable 3 restates §9
row 3 as an incremental delta, so a reader of §9 alone cannot arrive at the
recompute-on-write design T-005 shipped. Phase 3 is a hard prerequisite, because
the delta is computed from `IssueMutation.before`.

The implementer runs `pstack:interrogate` on this diff before opening the PR.
The counter design is the contested one.

## Changes

Alternative A from the overview. No migration. `progress_points_cache` is already
a TEXT column holding JSON.

**`src/lib/services/projects-progress.ts`.**

- `ProgressPoints` widens from `{done, total}` to
  `{done, total, issuesDone, issuesTotal}`. `done` and `total` stay
  estimate-weighted. The two new fields hold live issue counts.
- `progress_cache` becomes derived from the issue counts,
  `round(100 * issuesDone / issuesTotal)` and 0 when `issuesTotal` is 0. It stays
  the stored rounded percent that reads serve, per §9. A percent cannot be
  incremented, which is why the counts have to be stored at all.
- `parseProgressPoints` tolerates the legacy two-field shape. A row missing
  `issuesTotal` is reported as legacy rather than parsed into zeros, so it routes
  to the repair path instead of silently reading as an empty project.
- A new increment path replaces the aggregate. From `event.before` and the
  post-write row it derives, per affected project, how many issues joined or
  left, how many crossed into or out of the completed category, and the same two
  numbers weighted by estimate. It then issues one `UPDATE projects` per affected
  project applying the increments and recomputing the derived percent from the
  new counts. No `count(*)` and no `sum(...)` over `issues` on the write path.
- `recomputeProjectProgress` is renamed to `repairProjectProgress` and keeps the
  workspace predicate phase 2 gave it. It is never called from the write path.
  It exists for backfill and as a reconciliation entry point.

**The gate.** `syncProjectProgress` returns immediately when the mutation touches
none of `stateId`, `estimate`, `projectId`, `deletedAt`. A title edit, a priority
edit, an assignee change, and a label change all do no work at all. `created` and
`deleted` kinds always change membership, so they pass the gate unconditionally.
This is alternative C from the overview's table, folded in here because a
mutation that cannot move the number should not touch the database. It also
removes the 200-issue bulk amplification the T-005 work log records, and
`bulkUpdateIssues` allows up to 200 ids.

**`src/lib/services/projects.ts`.** `createProject` seeds the four-field JSON
instead of `{done: 0, total: 0}`.

**Backfill.** Existing rows hold the two-field shape and would drift the moment
an increment landed on them. Two entry points, no migration and no new script:

- Self-healing on first touch. When the increment path finds a legacy cache on an
  affected project, it calls `repairProjectProgress` once for that project and
  then applies the increment to the repaired numbers. Each project pays one
  aggregate once, ever.
- `repairAllProjects(wsId)`, exported for a manual reconciliation over every live
  project in a workspace.

A one-shot entry point under `scripts/` would be cleaner to operate, but
`scripts/**` is M0-owned per §8 line 859 and would need its own amendment. That
cost is not worth paying for a backfill that self-heals.

**The acceptance test.** The existing O(1) test counts prepared statements, and a
full table scan reads as one statement and passes. It is replaced by an assertion
about rows read, so a scan fails it. [testing.md](testing.md) carries the shape.

## Data structures

- `ProgressPoints` gains `issuesDone` and `issuesTotal`. The stored shape is
  `{done, total, issuesDone, issuesTotal}`, matching §2.4 as amended by T-022.
- `ProgressDelta`, new. The per-project increment
  `{issues, issuesDone, points, pointsDone}`, applied by one UPDATE.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

**Runtime.** Two observations, both against a served build.

1. Correctness. `npm run build`, then `npm run preview -- --port 4321`. Create a
   project, add issues over HTTP, complete some, move one to another project,
   trash one. Then read `progress_cache` and `progress_points_cache` straight out
   of `data/prodmax.db` and compare them against what `repairProjectProgress`
   computes for the same project. Observed end state: the incremented values and
   the repaired values are identical. Any drift is a delta bug and blocks the
   phase.
2. Cost. Seed 5,000 issues into one project directly in SQLite. Time a single
   `PATCH /api/issues/:id` that changes only the title, and a second that changes
   the state. Observed end state after this phase: the title edit performs no
   project write at all, and the state edit's wall time does not move when the
   project holds 5,000 issues instead of 50. Before this phase both scale with
   the issue count.
