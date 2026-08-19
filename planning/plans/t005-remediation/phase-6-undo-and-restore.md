# Phase 6: undo and restore emit faithful events

Back to [overview.md](overview.md).

## Goal

Every issue an undo or a restore rewrites emits its own mutation event carrying
its own before-state, so every affected project's counters follow the rewrite.
Today they do not, and nothing self-heals, because reads never recompute.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. This phase edits
`src/lib/services/issues-bulk.ts` and `src/lib/services/issues-update.ts`, both
M1-owned. Phase 3 is a hard prerequisite, because the events this phase emits are
only useful if they can carry `before`.

## Changes

**`src/lib/services/issues-bulk.ts`, `restoreSnapshot`.** It rewrites `teamId`,
`stateId`, `projectId`, `cycleId`, `archivedAt`, `deletedAt`, and `version` by
raw SQL and emits nothing. It already loads the current row as `current` before
the write, which is exactly the before-state. It gains one
`recordIssueMutation` per restored issue, `kind: "updated"`, `before` built from
`current`, and the snapshot fields as the patch. The emission goes after the
label replacement so the row is fully restored when the consumer reads it.

**`src/lib/services/issues-bulk.ts`, `applyUndo`.** It emits one synthetic event
naming `snapshots[0]` with `patch: {undo: true}`. Every other issue in the batch
is silent, so every project the batch touched except at most one keeps counting
issues it no longer owns. That single emission is deleted. The per-issue events
from `restoreSnapshot` replace it. An undo marker stays on the patch so T-016 can
label the events without inferring it.

**`src/lib/services/issues-update.ts`, `restoreIssue`.** It clears `deletedAt` by
raw SQL, emits nothing, and takes neither a workspace id nor an actor, so it
cannot emit as written. Its signature grows both and it emits `kind: "updated"`
with `before` taken from the pre-restore row. `restoreSnapshot` is its caller and
already holds both values.

**Left alone, deliberately.** `bulkUpdateIssues` also emits one synthetic event
naming `input.ids[0]` with `patch: {bulk: action}`. It is not deleted here. Every
issue in a bulk goes through `updateIssue`, `trashIssue`, or `moveIssueTeam`,
each of which already emits a faithful per-issue event, so the counters are
correct without it. Under phase 5's gate the synthetic event touches none of the
four watched fields and does no work. It is noted for T-016, which will want it
removed or made real.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

Unit coverage: bulk-move issues spanning two source projects into a third, undo
the token, and assert all three projects' caches match what
`repairProjectProgress` computes. The multi-project case is the one the
`snapshots[0]` emission cannot pass.

**Runtime.** Against a served build.

1. `npm run db:migrate && npm run seed`, `npm run build`,
   `npm run preview -- --port 4321`.
2. Create projects A, B, and C. Put two issues in A and two in B, completing one
   on each side, so both read 50.
3. `POST /api/issues/bulk` with `action: "project"` and `value: C` over all four
   ids. Capture the undo token.
4. `POST /api/undo/:token`.
5. Read all three `progress_cache` values directly out of `data/prodmax.db`.
   Observed end state: A is 50, B is 50, C is 0. Before this phase A or B, and
   usually both, stay at whatever they held after step 3, and no later read
   corrects them.
