# Phase 5: delta counters

Back to [overview.md](overview.md).

## Goal

A counter update becomes O(1) per write and O(1) per batch, not per issue. The
full aggregate leaves the write path and survives as an exported repair path.

## Blocked on

T-022 deliverables 2 and 3. Deliverable 2 amends §2.4's `progress_points_cache`
note to the four-field shape. Deliverable 3 restates §9 row 3 as an incremental
delta, so a reader of §9 alone cannot arrive at the recompute-on-write design
T-005 shipped.

Phases 3 and 4 are hard prerequisites. The delta comes off `IssueTransition`, and
the batch flush feeds the consumer.

The implementer runs `pstack:interrogate` on this diff before opening the PR. The
counter design is the contested one.

## Changes

Alternative A from the overview. No migration. `progress_points_cache` is already
a TEXT column holding JSON.

**`src/lib/services/projects-progress.ts`.**

- `ProgressPoints` widens from `{done, total}` to
  `{done, total, issuesDone, issuesTotal}`. `done` and `total` stay
  estimate-weighted. The two new fields hold live issue counts.
- `progress_cache` derives from the issue counts,
  `round(100 * issuesDone / issuesTotal)` and 0 when `issuesTotal` is 0. It stays
  the stored rounded percent that reads serve, per §9. Nothing can increment a
  percent, which is why the counts have to live in the row at all.
- `parseProgressPoints` tolerates the legacy two-field shape. A row missing
  `issuesTotal` reads as legacy rather than as zeros, so it routes to the repair
  path instead of looking like an empty project.
- An increment path replaces the aggregate on the write path. It folds the whole
  batch into one `ProgressDelta` per affected project, then issues one
  `UPDATE projects` per project and recomputes the derived percent from the new
  counts. No `count(*)` and no `sum(...)` over `issues` on the write path.
- `recomputeProjectProgress` becomes `repairProjectProgress` and keeps the
  workspace predicate phase 2 gave it. It stays exported, never runs on the write
  path, and never goes away. T-023 is why.

**Counted-set membership, one rule for every case.** An issue snapshot counts
when its `projectId` is set, its `deletedAt` is null, and its state category is
not `canceled`.

The existing aggregate already drops canceled issues from both totals, and an
earlier draft of this phase never mentioned them. A delta described only as
crossing into and out of `completed` drifts the moment anyone cancels an issue.

Membership makes that fall out. A counted snapshot contributes 1 to
`issuesTotal`, its estimate to `total`, and, when its category is `completed`, 1
to `issuesDone` and its estimate to `done`. A snapshot outside the set
contributes nothing anywhere. The delta for one transition is the `after`
contribution minus the `before` contribution, each applied to its own side's
project.

Joining a project, leaving one, trashing, restoring, canceling, un-canceling,
completing, un-completing, and editing an estimate then share one code path. No
special case survives to forget, and `canceled` has no second place to go wrong.

**Repair instead of increment, never repair and then increment.** A project whose
cache is legacy or absent gets `repairProjectProgress` and no increment at all.
The consumer runs after the issue write inside the same transaction, so the
repair aggregate already counts the mutated row.

Incrementing a repaired number double-counts the current mutation. An earlier
draft of this phase called for exactly that, and it was a spec bug that would
have drifted silently rather than failed a test. Each project pays one aggregate
once, ever.

`repairAllProjects(wsId)` ships alongside it for a deliberate reconciliation over
every live project in a workspace. A one-shot entry point under `scripts/` would
be easier to operate, but §8 line 859 gives `scripts/**` to M0 and it would need
its own amendment. That cost outweighs a backfill that self-heals.

**The gate compares state category, not `stateId`.** The consumer returns
immediately when a transition's counted contribution matches on both sides. A
title edit, a priority edit, an assignee change, a label change, and a cycle
change all do no work at all.

Moving an issue from "In Progress" to "In Review" changes `stateId`, and both
states are `started`, so the contribution matches and nothing writes. A `stateId`
gate would have let that transition through and written a zero delta.

This is alternative C from the overview's table, folded in here because a
mutation that cannot move the number should not touch the database. It also
removes the 200-issue bulk amplification the T-005 work log records, and
`bulkUpdateIssues` allows up to 200 ids.

Resolving a category costs one indexed `states` read by primary key, memoized per
batch. `updateIssue` hands its already-resolved state to `w.noteState`, so the
common single-issue state change resolves nothing extra.

**`src/lib/services/projects.ts`.** `createProject` seeds the four-field JSON
instead of `{done: 0, total: 0}`.

**What this design still cannot see, and why the repair path stays exported.**
Every delta-counter design goes silently wrong after an admin edits a workflow
state. `PATCH /api/states/:id` can change a state's `category`, and
`DELETE /api/states/:id` reassigns every issue in the state with one raw
statement.

Both change what an issue contributes without writing the issue, so no transition
exists to carry the delta.
`planning/tickets/T-023-state-writes-corrupt-progress.md` owns that defect and
depends on `repairProjectProgress` existing. This phase does not fix it and must
not pretend to. Exporting the repair path rather than hiding it is the concrete
thing this phase does for T-023.

**Archived issues keep counting.** The current aggregate counts them, because it
excludes only `deletedAt` and the canceled category, and §2.4 does not say either
way. The membership rule above preserves that. Changing it is a product decision
and costs one clause here and one in the repair aggregate. This phase does not
make it under cover of a refactor.

**The acceptance test.** The existing O(1) test in `tests/api/projects.test.ts`
counts prepared statements, and a full table scan is one prepared statement and
passes. It is replaced. [testing.md](testing.md) carries the shape.

## Data structures

```ts
interface ProgressPoints {
  done: number;       // estimate-weighted
  total: number;      // estimate-weighted
  issuesDone: number; // live issue count
  issuesTotal: number;
}

interface ProgressDelta {
  issues: number;
  issuesDone: number;
  points: number;
  pointsDone: number;
}

// null means the snapshot is in no counted set at all.
function contribution(row: IssueRow, category: StateCategory): ProgressDelta | null;
```

The stored shape is `{done, total, issuesDone, issuesTotal}`, matching §2.4 as
amended by T-022. `ProgressDelta` is both the per-snapshot contribution and the
folded per-project increment, so subtraction is the only operation the consumer
needs.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

Two unit tests carry this phase.

The replacement cost test intercepts every statement prepared during one write,
runs `EXPLAIN QUERY PLAN` over each, and fails on any plan that scans `issues`.
It also asserts that the statement count does not grow with the number of issues
in the project. Counting statements alone is what let the scan through.

The property-based test generates a random sequence of creates, state changes
across all four categories, project moves, estimate edits, cancels, trashes, and
undos, and asserts after every step that the incremented cache equals what
`repairProjectProgress` computes for the same project. A scripted sequence does
not find the canceled case or the estimate change on an already-done issue,
which are exactly the two the reviewed design got wrong. The generator is
hand-rolled from a seeded PRNG in the test file, because adding `fast-check`
edits `package.json`, which is M0-owned and would cost a second amendment. A
failing seed is printed so the case can be replayed.

Both files sit under `tests/api/projects*`, which is what T-005's `owns:` line
covers.

**Runtime.** Two observations, both against a served build.

1. Correctness. `npm run build`, then `npm run preview -- --port 4321`. Create a
   project, add issues over HTTP, complete some, cancel one, move one to another
   project, trash one. Then read `progress_cache` and `progress_points_cache`
   straight out of `data/prodmax.db` and compare them against what
   `repairProjectProgress` computes for the same project. Observed end state: the
   incremented values and the repaired values are identical. Any drift is a delta
   bug and blocks the phase.
2. Cost. Seed 5,000 issues into one project directly in SQLite. Time a single
   `PATCH /api/issues/:id` that changes only the title, a second that moves the
   state between two `started` states, and a third that completes the issue.
   Observed end state after this phase: the first two perform no project write at
   all, and the third's wall time does not move when the project holds 5,000
   issues instead of 50. Before this phase all three scale with the issue count.
