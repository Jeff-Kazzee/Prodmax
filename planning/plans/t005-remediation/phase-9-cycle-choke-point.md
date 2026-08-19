# Phase 9: cycle scope and rollover through the choke-point

Back to [overview.md](overview.md).

## Goal

Adding an issue to a cycle, removing it, and rolling it over at close all go
through the documented issue-mutation choke-point, so history is complete and
T-016's SSE sees them.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. Routing these writes
through the M1 issue service means calling into M1-owned files, and the
alternative described below writes M1's history and event records directly.
Phase 3 is a prerequisite either way, because the events carry `before`.

## Changes

`updateCycleScope` and `closeCycle` in `src/lib/services/cycles.ts` both write
`issues` with raw batched updates that set `cycleId`, bump `updatedAt`, and
increment `version`. Neither calls `recordFieldChange` and neither calls
`recordIssueMutation`. The version bump is the tell. Every other writer of
`issues.version` in the codebase emits both. The consequences are that the issue
history ledger has a gap where a cycle assignment should be, and T-016's SSE
consumer will never see a scope change or a rollover.

**Chosen fix, route through `updateIssue`.** Both functions call the M1
`updateIssue` once per touched issue with `{cycleId}` instead of issuing the raw
update. History, version, and the mutation event then come from the one path that
already gets them right, and the duplicated write logic in the cycles service
disappears. The calls stay inside the existing transaction, so close remains
atomic.

The cost is honest and worth writing down. `cycleScopeSchema` caps `add` and
`remove` at 500 each, so one scope call can walk up to 1,000 issues through the
full update path instead of two batched statements. Rollover at close is bounded
by the number of open issues in the cycle, which is untested at scale. If the
implementer measures a real problem, the fallback is to keep the batched update
and emit `recordFieldChange` plus `recordIssueMutation` per touched issue from a
row set the function already has to read. That is more code and two ways to write
the same field, which is why it is the fallback rather than the plan.

Either way, the per-issue events carry `before`, so the phase 5 increment path
sees a cycle change as a mutation touching none of `stateId`, `estimate`,
`projectId`, `deletedAt` and correctly does no counter work.

The workspace predicates on both functions' selects and updates land in phase 2
and are unaffected by this change.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

Unit coverage: after a scope add, a scope remove, and a close with rollover,
`listIssueHistory` for each touched issue contains a `cycle` row with the right
old and new values, and a test listener registered through `onIssueMutation`
receives one event per touched issue.

**Runtime.** Against a served build.

1. `npm run db:migrate && npm run seed`, `npm run build`,
   `npm run preview -- --port 4321`.
2. Create a cycle, then `POST /api/cycles/:id/scope` adding two issues.
3. `GET /api/issues/:id/history` for each. Observed end state: a `cycle` entry
   naming the cycle. Before this phase the history is empty for that field.
4. `POST /api/cycles/:id/close` with one issue still open, then read that issue's
   history again. Observed end state: a second `cycle` entry naming the next
   cycle. Before this phase the issue silently changes cycles with no ledger
   entry at all.
