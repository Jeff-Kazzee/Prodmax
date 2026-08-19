# Phase 10: consider-tier cleanup

Back to [overview.md](overview.md).

## Goal

Close the six consider-tier findings that do not depend on the event contract.
None of these is blocking on its own. Together they are the difference between an
endpoint set that behaves under §3 and one that returns 500s.

## Blocked on

Nothing. Every change is inside M4-owned service, endpoint, or test files. Item 6
is deliberately recorded rather than fixed, for the reason given there.

## Changes

**1. The 422 decision.** T-022 deliverable 5 keeps 400. `src/lib/api/errors.ts`
maps `VALIDATION` to 400 and calls that mapping binding, and 422 appears nowhere
else in `src/`. `updateCycleScope` in `src/lib/services/cycles.ts` drops the
explicit `422` argument on its scope-conflict throw, and the assertion in
`tests/api/cycles.test.ts` moves to 400 along with the test name. The endpoint
docstring in `src/pages/api/cycles/[id]/scope.ts` that advertises 422 changes with
it.

**2. `leadId` and `briefPageId`.** `createProject` and `updateProject` in
`src/lib/services/projects.ts` write both straight through. Under
`foreign_keys=ON` a bad id raises a `SqliteError`, which `route()` turns into a
bare 500. Both are validated against the workspace before the write and a bad id
raises `VALIDATION`, so the client gets the §3 error shape. `leadId` resolves
through workspace membership, not the global `users` table, so a user in another
workspace is rejected rather than silently accepted. `briefPageId` resolves
against live pages in the same workspace.

**3. Paging for `listProjectUpdates`.** The service returns every row and the
endpoint at `src/pages/api/projects/[id]/updates.ts` hardcodes `nextCursor: null`,
which advertises a cursor contract it does not implement. Both move onto
`pageParams` and `paginate` from `src/lib/api/paginate.ts`, the same helpers
`listIssues` uses, and the endpoint returns the real cursor. The ordering stays
`createdAt` descending with an id tiebreak, which is already cursor-stable.

**4. A parse guard on `statsSnapshot`.** `statsFor` and `listCycles` in
`src/lib/services/cycles.ts` call `JSON.parse` on the stored snapshot with no
guard, so a malformed value throws inside a GET and returns 500. A guarded parse
returns the empty stats shape on malformed JSON, mirroring what
`parseProgressPoints` already does for the progress cache.

**5. Next-cycle rollover ordered chronologically.** `closeCycle` picks the next
cycle as the lowest-numbered non-completed cycle after this one. §2.4 describes
rollover chronologically, and numbers and dates diverge as soon as a cycle is
created out of order. The lookup orders by `starts_at` and takes the earliest
non-completed cycle that starts at or after the closing cycle's `ends_at`. Number
allocation for newly created cycles is unchanged, and the UNIQUE(team_id, number)
skip-past logic in the auto-create branch stays as it is.

**6. The dead `teams.next_cycle_number` column.** `maxNumberForTeam` allocates
cycle numbers, so the column at `src/db/schema.ts:137` is never read and never
written. It is recorded here as dead and left in place. Dropping it means editing
`src/db/schema.ts` and generating a migration, and the overview excludes both.
The drop belongs to whichever ticket next serializes a migration at the
integration checkpoint.

## Data structures

- A guarded `CycleStats` parse replaces the two bare `JSON.parse` calls on
  `cycles.stats_snapshot`. The stored shape is unchanged.
- `listProjectUpdates` returns `{data, nextCursor}` instead of a bare array.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

**Runtime.** Against a served build, three observations that each map to an item
above.

1. `PATCH /api/projects/:id` with a `leadId` belonging to another workspace.
   Observed end state: 400 with the §3 body. Before this phase, a 500 with no
   error code.
2. Post 60 project updates, then `GET /api/projects/:id/updates?limit=25`.
   Observed end state: 25 rows and a non-null `nextCursor` that fetches the next
   page. Before this phase, 60 rows and `nextCursor: null`.
3. Corrupt one completed cycle's `stats_snapshot` in `data/prodmax.db` to a
   non-JSON string, then `GET /api/cycles?wsId=&teamId=`. Observed end state:
   200 with zeroed stats for that cycle. Before this phase, 500.

Items 1, 5, and 6 have no runtime proof beyond the unit suite. The status-code
change is asserted by the test it moves, the rollover ordering needs a
constructed out-of-order cycle set that only a unit test can reasonably build,
and item 6 changes no behavior at all.
