# T-005 — M4a Projects/cycles API

status: claimed
module: M4 projects & cycles
assignee: kimi-code-swarm 2026-08-19
owns: src/pages/api/projects/**, src/pages/api/project-updates/**, src/pages/api/milestones/**, src/pages/api/cycles/**, src/lib/services/{projects,project-updates,milestones,cycles}*, src/lib/validation/{projects,cycles}*, tests/api/{projects,cycles}*, and for the remediation only, per the §8 recorded amendment of 2026-08-19: src/lib/services/issues-events.ts, src/lib/services/issues-update.ts, src/lib/services/issues.ts, src/lib/services/issues-bulk.ts, src/lib/services/issues-history.ts
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

## Work log

### 2026-08-19 review pass (gates + adversarial review, no code changed)

Gates, all four green against the untracked working tree:
`npm run check` 0 errors / 0 warnings / 6 hints across 234 files.
`npm test` 160 passed in 36 files. `npm run build` clean in 17.26s.
`npm run e2e` 8 passed. Note that none of the 8 e2e specs touch projects
or cycles, so the e2e gate carries no evidence about this ticket.

Three-model adversarial review (pstack `/interrogate`, Opus + Fable +
Sonnet, read-only). Green gates are hiding spec violations. Status stays
`claimed`, not `in-review`, until the act-on list clears.

**Act on, blocking:**

1. The progress hook is never armed in production. `onIssueMutation(
   syncProjectProgress)` at `projects-progress.ts:121` runs as an import
   side effect, and no issue-write path imports that module. Confirmed in
   the built output: no chunk under `dist/server/pages/api/issues/**`
   pulls in the chunk holding the registration. `progress_cache` stays 0
   unless a projects route was served first in that process. Vitest hides
   it because the test file imports both endpoint modules at the top.
2. §9's O(1) rule is violated. `recomputeProjectProgress` runs a
   `count(*)` plus three `sum(...)` aggregates over every live issue in
   the project, on every issue mutation, including title and priority
   edits that cannot change progress. `bulkUpdateIssues` allows 200 ids,
   so one bulk action pays 200 full aggregates. The acceptance test
   counts prepared statements rather than rows, so a full scan reads as
   one query and passes. The module docstring asserting "O(1) indexed
   queries" is wrong.
3. Guests get write access to projects, milestones, project updates, and
   cycles. All 17 `requireWorkspace` calls in this ticket pass no
   `minRole`. Twelve of those 17 handlers are writes and need `member`, the other
   five are GETs. Architecture §7 lines 840 to 842 deny guest on exactly
   these rows. A guest can close a cycle, which is irreversible. The
   codebase already passes `minRole` correctly in states and labels.
4. `recomputeProjectProgress` has no workspace predicate on either the
   aggregate or the `UPDATE projects`, and `affectedProjectIds` feeds it
   a `projectId` taken straight from the request patch. A member of one
   workspace can overwrite another workspace's counters. Needs a uuid7 id
   from the target tenant, so treat it as a tenancy-invariant break
   rather than a live exploit.
5. Undo leaves caches permanently stale. `restoreSnapshot` rewrites
   `stateId`, `projectId`, and `deletedAt` by raw SQL, and `applyUndo`
   emits one event for `snapshots[0]` only. Every other affected project
   keeps counting issues it no longer owns, and reads never recompute, so
   nothing self-heals. `restoreIssue` emits nothing at all.

**Consider:** cycle `status` never advances from `future` to `active`
(derived only at create, patch, and close). Rollover and
`updateCycleScope` write `issues` without workspace scope and behind the
documented mutation choke-point, so history and T-016 SSE will miss them.
Next-cycle rollover picks by `number` while §2.4 describes it
chronologically. Cache writes are not in the same transaction as the
issue write, so a listener throw returns 500 on a committed mutation.
`leadId` and `briefPageId` accept ids from any workspace and a bad id
surfaces as 500 rather than the §3 error shape.

**Deviations found, both recorded only in code comments and never
filed:** §3.5 specifies `GET /api/teams/:teamId/cycles` and the code
serves `GET /api/cycles?wsId=&teamId=`. The 3-minute history grace
window leaves the old project's cache stale after a create-then-reproject,
and the test backdates `created_at` to step around it.
