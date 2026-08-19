# Phase 2: workspace predicates in M4 services

Back to [overview.md](overview.md).

## Goal

Every query in an M4-owned service that reads or writes a workspace-scoped row
carries `WHERE workspace_id = :wsId`. §7 line 820 makes that clause binding and
six queries in this ticket do not have it.

## Blocked on

Nothing. Every site is inside `src/lib/services/projects-progress.ts` or
`src/lib/services/cycles.ts`, both carved out to T-005 in its `owns:` line.

## Changes

`:wsId` always comes from the server-side session resolution that
`requireWorkspace` already performed, never from a client payload. Two functions
grow a `wsId` parameter to carry it, which is a signature change inside M4 files
and needs no amendment.

**`src/lib/services/projects-progress.ts`.**

- `recomputeProjectProgress(projectId)` becomes `(wsId, projectId)`. Its aggregate
  over `issues` joined to `states` filters on project id alone, so it counts rows
  from any workspace that happens to share the id. The `UPDATE projects` beneath
  it matches on primary key alone, so it writes any workspace's row. Both get the
  clause. Phase 5 renames this function to the repair path and takes it off the
  write path. The predicate belongs on it either way.
- `syncProjectProgress` passes `event.workspaceId` down. That value is the
  session-resolved workspace the mutation ran under.

**`src/lib/services/cycles.ts`.**

- `updateCycleScope`, the issue lookup. The `SELECT` over `issues` matches on
  `inArray(issues.id, touched)` with no workspace clause and then post-filters the
  result in JavaScript by comparing `row.workspaceId`. A filter after the read is
  not the §7 predicate. The clause moves into the query. The JavaScript check that
  builds the `offending` list stays, because it also enforces liveness and team
  match, which is a different rule.
- `updateCycleScope`, the two `UPDATE issues` statements inside the transaction.
  Remove matches on `cycleId` plus the id list, add matches on the id list alone.
  Both get the clause. This is the same defect class as the lookup above and sits
  in the same function.
- `closeCycle`, the rollover select. Open issues are selected by `cycleId` plus a
  state-category subquery. The subquery `SELECT id FROM states WHERE category NOT
  IN (…)` is also unscoped. Both the outer select and the subquery get the clause.
- `closeCycle`, the rollover update. The `UPDATE issues` that sets the next cycle
  matches on the id list alone. It gets the clause.
- `maxNumberForTeam(teamId)` becomes `(wsId, teamId)`. It computes `MAX(number)`
  over `cycles` filtered by team only, so a team id from another workspace would
  return that workspace's high-water mark. Both callers, `createCycle` and
  `closeCycle`, pass their `wsId`.
- `closeCycle`, the next-cycle lookup. It selects the lowest-numbered
  non-completed cycle after this one, filtered by team and number only. It gets
  the clause. Phase 10 changes its ordering, not its predicate.

Team ids reaching these functions are already validated by
`requireTeamInWorkspace`, so the clause is defence in depth on the cycle paths.
On `recomputeProjectProgress` it is not, because `affectedProjectIds` feeds it a
project id taken straight from the request patch. That is the tenancy break the
T-005 work log records as finding 4. Phase 7 removes the foreign id at the door.
This phase makes the query safe even when one gets through.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

Add unit coverage that seeds two workspaces holding rows with the same team and
project shape, runs each of the six paths under workspace A, and asserts that
workspace B's `projects` and `issues` rows are byte-identical afterwards.

**Runtime.** This phase has no runtime proof beyond the unit suite, and inventing
one would be dishonest. The predicate is invisible from outside the process
unless a caller already hands a service a foreign id, and the only caller that
does is the parenting hole fixed in phase 7. The HTTP-level proof of that hole
lives in phase 7's verification and exercises these predicates from the outside.
