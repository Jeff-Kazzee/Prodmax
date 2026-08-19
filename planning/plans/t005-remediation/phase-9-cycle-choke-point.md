# Phase 9: cycle scope and rollover through the choke-point

Back to [overview.md](overview.md).

## Goal

Adding an issue to a cycle, removing it, and rolling it over at close all go
through the documented issue-write choke-point, so history is complete and
T-016's SSE sees them. The cost stays two statements per operation rather than
two per issue.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. Phase 3 is a hard
prerequisite, because this phase is built on `w.writeMany`, which phase 3
defines.

## Changes

`updateCycleScope` and `closeCycle` in `src/lib/services/cycles.ts` both write
`issues` with raw batched updates that set `cycleId`, bump `updatedAt`, and
increment `version`. Neither calls `recordFieldChange` and neither records a
mutation. The version bump is the tell. Every other writer of `issues.version` in
the codebase does both. The consequences are that the issue history ledger has a
gap where a cycle assignment should be, and T-016's SSE consumer will never see a
scope change or a rollover.

**The fix is `w.writeMany`.** Both functions open a `runIssueWrite` with
`cause: "cycle"` and hand the writer the rows they already select. `writeMany`
issues one `UPDATE ... WHERE id IN (...)`, re-reads the affected rows in one
batched select, and records one faithful transition per issue. The raw update in
`cycles.ts` disappears, and so does the duplicated version-bump logic.

An earlier draft of this file routed every touched issue through `updateIssue`
instead. That is deleted, along with the fallback discussion attached to it.
`cycleScopeSchema` caps `add` and `remove` at 500 each, so that approach walked
up to 1,000 issues through the full update path, each trip doing a history read,
a label pass, and a blocker downgrade check that a cycle change cannot possibly
need. `writeMany` gives the same faithful per-issue transitions for two
statements.

`updateCycleScope` keeps its remove-before-add ordering, so an id present in both
lists ends up added. That is two `writeMany` calls, not one.

`closeCycle` keeps its four steps in order. The rollover select it already runs
supplies the before-rows for its single `writeMany`, so it reads nothing extra.
Freezing the stats snapshot, creating or finding the next cycle, and marking the
cycle completed are unchanged and stay inside the same transaction, which
`runIssueWrite` joins rather than opens.

History rows for the `cycle` field come from the same transition list, one
`recordFieldChange` per issue. That stays a per-issue insert because
`issue_history` is a per-issue ledger and `recordFieldChange` folds rows inside
the 3-minute create grace window, which a batched insert would have to
reimplement. It is bounded by the same 500-issue cap.

The counter work is zero. `cycleId` is not part of the counted-set membership
rule, so every one of these transitions has an identical contribution on both
sides and the phase 5 gate rejects all of them before any query runs. A
1,000-issue scope call performs no project read and no project write.

The workspace predicates on both functions' selects and updates land in phase 2
and are unaffected by this change.

## Data structures

None. This phase consumes `IssueWriter.writeMany` from phase 3 and adds no shape
of its own.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

Unit coverage: after a scope add, a scope remove, and a close with rollover,
`listIssueHistory` for each touched issue contains a `cycle` row with the right
old and new values, and a consumer added through `withIssueConsumers` receives
one transition per touched issue with the right `before.cycleId` and
`after.cycleId`. The fixture has to place the issues outside the 3-minute create
grace window, or `recordFieldChange` folds the history row away and the test
fails for the wrong reason.

A cost assertion covers the batch. A scope call over 200 issues prepares a
bounded number of statements that does not grow with the batch size, and issues
no `UPDATE projects` at all.

**Runtime.** Against a served build.

1. `npm run db:migrate && npm run seed`, `npm run build`,
   `npm run preview -- --port 4321`.
2. Create a cycle, then `POST /api/cycles/:id/scope` adding two issues created
   more than three minutes earlier.
3. `GET /api/issues/:id/history` for each. Observed end state: a `cycle` entry
   naming the cycle. Before this phase the history is empty for that field.
4. `POST /api/cycles/:id/close` with one issue still open, then read that issue's
   history again. Observed end state: a second `cycle` entry naming the next
   cycle. Before this phase the issue silently changes cycles with no ledger
   entry at all.
