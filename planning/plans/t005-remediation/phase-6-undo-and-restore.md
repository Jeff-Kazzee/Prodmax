# Phase 6: undo and restore emit faithful events

Back to [overview.md](overview.md).

## Goal

Every issue an undo or a restore rewrites goes through the writer and produces
its own transition, so every affected project's counters follow the rewrite.
Today they do not, and nothing self-heals, because reads never recompute.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. This phase edits
`src/lib/services/issues-bulk.ts` and `src/lib/services/issues-update.ts`, both
M1-owned. Phase 3 is a hard prerequisite, because these writes have to run
through `runIssueWrite` and `w.write` before anything records them.

## Changes

**`src/lib/services/issues-bulk.ts`, `restoreSnapshot`.** It rewrites `teamId`,
`stateId`, `projectId`, `cycleId`, `archivedAt`, `deletedAt`, and `version` by
raw SQL and records nothing. It already loads the current row as `current` before
the write, which is exactly the before-state.

The raw update becomes one `w.write(current, snapshotPatch)`, and the transition
falls out of that call. The label replacement stays where it sits and needs no
event, because labels sit outside the counted set.

`restoreSnapshot` also drops its own `restoreIssue` call. The snapshot patch
already carries `deletedAt`, so un-deleting rides along in the same single write
rather than a second one.

**`src/lib/services/issues-bulk.ts`, `applyUndo`.** It records one synthetic
event naming `snapshots[0]` with `patch: {undo: true}`. Every other issue in the
batch stays silent, so every project the batch touched except at most one keeps
counting issues it no longer owns.

That emission goes. The per-issue transitions from `restoreSnapshot` replace it.
`applyUndo` opens its `runIssueWrite` with `cause: "undo"`, and every nested write
inherits it, so T-016 can label the events without inferring intent from an
untyped patch marker.

The whole undo is one batch. A 200-issue undo spanning three projects produces
200 transitions and three `UPDATE projects` statements.

**`src/lib/services/issues-update.ts`, `restoreIssue`.** It clears `deletedAt` by
raw SQL, records nothing, and takes neither a workspace id nor an actor, so as
written it cannot record anything. Its only caller is `restoreSnapshot`, which no
longer needs it. Delete it rather than re-plumb it. That also removes one of the
raw `issues` writes the phase 11 source-tree gate counts.

**`bulkUpdateIssues`, corrected.** It records one more synthetic event, naming
`input.ids[0]` with `patch: {bulk: action}`. An earlier draft of this file left
that alone. It cannot stay, because phase 3 deletes both `kind` and the untyped
`patch` markers it rests on.

The emission goes too. Every issue in a bulk already runs through `updateIssue`,
`trashIssue`, or `moveIssueTeam`, each of which now produces a faithful
transition of its own. `bulkUpdateIssues` opens the `runIssueWrite` with
`cause: "bulk"` instead, so the intent rides every transition in the batch rather
than one synthetic extra.

## Data structures

None. This phase moves existing writes onto the phase 3 writer and deletes two
synthetic emissions.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

Unit coverage: bulk-move issues spanning two source projects into a third, undo
the token, and assert all three projects' caches match what
`repairProjectProgress` computes. The multi-project case is the one the
`snapshots[0]` emission cannot pass. A second assertion counts the `UPDATE
projects` statements the undo issues and expects one per affected project rather
than one per issue, which is the batch window doing its job.

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
