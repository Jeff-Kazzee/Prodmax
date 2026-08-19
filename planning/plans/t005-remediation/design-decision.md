[Back to overview](overview.md)

# Synthesized design: the issue-write contract

Four design packages, one per runner, on Opus, Fable, Opus, Opus. Two runners had
opposed mandates, one pushed radical and one pushed conservative. This file is the
synthesis decision. It is the contract phases 3 through 6, 9, and 11 implement.

## Where all four agreed

Convergence across four independent packages is the highest-confidence signal in
the exercise. All four landed on the same six calls, and the plan as I first wrote
it was wrong on two of them.

- Before-state and after-state travel together as a value, not as positional
  arguments. T-016 needs one serializable thing to write to `event_log`.
- The module-scope registration dies. Arming becomes a compile-time fact.
- `previousProjectId` and the `issue_history` read-back are deleted. That closes
  the grace-window hole as a side effect rather than as a fix.
- Bulk paths emit one event per issue. A single event naming `snapshots[0]` is
  the undo defect, and a batch event is that defect generalized.
- The full aggregate survives, renamed, as a repair and backfill path that never
  runs on the write path.
- The state category is resolved by the consumer, memoized, never carried on the
  event. Carrying it would tax every write with a `states` read to serve a
  consumer that skips most of them.

## The four decisions where they split

### Full row, not a curated subset

Three of four carry the whole `IssueRow` on each side. The fourth carries
`{stateId, estimate, projectId, deletedAt}`, which is exactly the counted
membership predicate and nothing more.

Chosen: the full row. Every emit site already holds both rows, so the full row is
free, and a curated subset is a second schema that gets relitigated. It already
would have. T-016 needs `version` and `identifier`, phase 9 needs `cycleId`, and
`moveIssueTeam` needs `teamId`. The subset advocate's own argument against
deleting `kind` rests on `moved` not being derivable, which is only true because
the subset omits `teamId`.

### `kind` is deleted, not kept

Chosen: deleted. `created` is `before === null` and is the union discriminant.
Everything else is a fact about the pair. A field that restates the rows can
disagree with them, and in this tree it already does. `applyUndo` emits
`kind: "updated"` for restores that un-delete rows, and `bulkUpdateIssues` emits
`kind: "updated"` for batches that may be entirely deletes.

The four wire names in §5 survive as `sseEventName(t)`, a pure function of the
pair. Derived, so it cannot drift. Writer intent that is genuinely not in the data
moves to `cause`, a closed union replacing the untyped `patch` markers that carry
`undo` and `bulk` today.

### The runtime registry is deleted

The runners split two against two, and this was the closest call.

Chosen: deleted. The decisive argument is that §5 requires a client reconnecting
with `Last-Event-ID: N` to receive every event after N, replayed across a process
restart. An in-memory listener array cannot serve that, so the real subscription
point for T-016 is the `event_log` table and its real consumer is a static one.
Every prospective subscriber is mandatory: the progress counter, the event-log
writer in T-016, the webhook dispatcher in M9. A subscription mechanism whose
every subscriber is mandatory is a commit-hook list wearing a costume, and the
costume is what let one of them go missing.

Keeping it alive labelled "T-016 will need this" preserves the mechanism that
failed and the reasoning that produced the failure. A future author reads it as a
supported extension point and re-enters the bug.

Tests keep a scoped seam, `withIssueConsumers(extra, fn)`, additive within a
callback and removed on return including on throw. A test cannot leak a consumer
into the next test and cannot become the thing that arms production.

### A batch window, and the writer owns the write

Two runners proposed buffering transitions and flushing once at the outermost
call. One went further and made the write and the record a single call on a
branded writer.

Chosen: both. This is the largest single win in the exercise and neither my plan
nor two of the four packages had it.

- A 200-issue bulk into one project becomes one `UPDATE projects`, not 200.
- A 1,000-issue cycle scope call becomes zero queries and zero writes, because
  `cycleId` is not watched and the gate rejects all 1,000 before any work.
- `w.write(before, patch)` performs the UPDATE and records the transition in one
  call. There is no second step to forget, so written-but-not-emitted stops being
  expressible. Neither of the other designs achieves that.
- The batch is the transaction, so phase 11 folds in rather than bolting on.

Nesting is already free. The better-sqlite3 session in Drizzle promotes a nested
`transaction()` to a savepoint, and every service on this path is synchronous.
`bulkUpdateIssues` already nests today.

## What the type makes impossible, and what it does not

Impossible after this change:

- A consumer that exists but is unwired. Membership is a closed union plus a
  `Record` over it, so declaring a name without supplying the consumer fails
  `astro check`.
- A transition with no before-state. The discriminant is structural, and there is
  no optional field to forget.
- A recorded write outside a transaction. The brand on the writer is a
  `unique symbol` that is not exported, and the only producer opens the
  transaction.
- A write that is not recorded. The write and the record are one call.

Not impossible, and stated plainly rather than papered over: a raw
`db.update(issues)` that bypasses the writer entirely. No type forbids calling
Drizzle. That becomes a check rather than a hope, per
`pstack:principle-encode-lessons-in-structure`. A vitest assertion greps the
source tree and fails when `issues` is written outside the choke-point. It reports
11 raw writes today, ten across the five amended service files plus one in the
states endpoint. After phases 3 through 6 and 9 it reports
exactly one, and that one is the subject of T-023.

Folding the gate into vitest rather than the `check` script keeps it inside
T-005's owns list and avoids a second amendment for an M0 file.

## Two spec bugs this exercise found in my own plan

Both would have produced silent counter drift rather than a failing test.

**Phase 5 said repair then increment.** The consumer runs after the issue write
inside the same transaction, so a repair aggregate already counts the mutated row.
Repairing and then incrementing double-counts the current mutation. The rule is
repair instead of increment.

**Phase 5 never mentioned `canceled`.** The existing aggregate excludes the
canceled category from both totals. A delta described only as crossing into and
out of `completed` drifts the moment anyone cancels an issue. The chosen shape
makes this fall out. A snapshot in a canceled state is counted nowhere, so
entering and leaving the counted set is the same code path as joining and leaving
a project.

One more, smaller. The gate compares state category, not `stateId`. Moving an
issue from "In Progress" to "In Review", both `started`, changes `stateId` and
would have passed a `stateId` gate, doing a pointless write with a zero delta.

## Open question this does not settle

Archived issues currently count toward both totals, because the aggregate excludes
only `deletedAt` and the canceled category. §2.4 does not say either way. Today's
behavior is preserved rather than changed under cover of a refactor. Answering it
"archived does not count" costs one clause in the repair aggregate and one field
in the gate. That needs a product decision, not an engineering one.

## One argument in the record that turned out to be false

Two of the four runners argued for keeping the runtime registry partly because
the test suite uses it. Verified against the tree: `onIssueMutation` appears
nowhere under `tests/`. The one test that drives the consumer,
`tests/api/projects.test.ts:314`, calls `syncProjectProgress` directly with a
hand-built event. So the registry has no test dependency to preserve, and the
tie-break did not need to weigh one. Recorded because the claim was repeated in
the synthesis before it was checked.
