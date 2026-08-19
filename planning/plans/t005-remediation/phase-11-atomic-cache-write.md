[Back to overview](overview.md)

# Phase 11: prove the choke-point holds

## Goal

Prove that the counter update is atomic with the issue write, and that nothing
writes `issues` outside the choke-point. This phase writes no service code. The
atomicity it used to bolt on is now a property of `runIssueWrite`, which opens
the transaction and flushes the consumers inside it. What is left is the part no
type can enforce and no earlier phase can claim.

## Blocked on

Phases 3, 4, 5, 6, and 9, all of them. The gate's expected count is only correct
once every one of them has landed. Nothing here is blocked on T-022, because this
phase touches only `tests/api/projects*`, which T-005 already owns.

## Changes

An earlier draft of this phase wrapped `updateIssue` in a transaction and moved
the mutation record inside it. That work moved into phase 3. `runIssueWrite`
opens or joins the transaction, and the batch flush runs before commit, so the
history inserts, the label replace, the issue UPDATE, and the counter update are
one unit. `createIssue`'s narrower version of the same gap closes the same way.
There is no separate transaction change left to make.

**The failure policy, stated once.** A consumer that throws rolls the issue write
back. Under §9 a committed issue write with a stale counter is the exact state
this plan exists to prevent, so rolling back is the correct default and it is a
decision rather than an accident of where the call sits. The client sees one
coherent error and an unchanged row, including an unchanged `version`.

**The source-tree gate.** No type forbids calling Drizzle directly, so a raw
`db.update(issues)` that bypasses the writer stays possible. That becomes a check
rather than a hope, per `pstack:principle-encode-lessons-in-structure`. A vitest
assertion greps the source tree for writes to the `issues` table and fails on any
outside `src/lib/services/issues-events.ts`, which holds the writer.

It is a vitest assertion rather than a `package.json` script because
`package.json` is M0-owned per §8 line 859 and a new script would cost a second
amendment. Folding it into vitest keeps it inside T-005's owns list and inside
the `npm test` gate every phase already runs.

The count is the point. The gate reports 11 violations today, ten across the five
service files `cycles.ts`, `issues.ts`, `issues-update.ts`, `issues-bulk.ts`, and
`issues-history.ts`, plus one in `src/pages/api/states/[id]/index.ts`. After
phases 3, 4, 5, 6, and 9 it reports exactly one, and that one is the raw
reassignment on line 88 of the states endpoint, which
`planning/tickets/T-023-state-writes-corrupt-progress.md` owns. A future reader
who sees one violation is looking at a correct tree with a known open ticket. A
reader who sees zero is looking at a tree where T-023 has closed. A reader who
sees more than one is looking at a regression.

The gate asserts the exact expected count and names the one allowed file, rather
than asserting "no more than before". A suppression list that grows is how this
class of check dies.

## Data structures

None. This phase adds tests only.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

The source-tree gate runs inside `npm test`. It must report exactly one violation
and name `src/pages/api/states/[id]/index.ts`. Run it against the tree before
phase 3 as well, and record that it reported 11. A gate that has never failed has
not been tested.

**Runtime.** Force the failure rather than reasoning about it. Add a throwing
consumer through `withIssueConsumers`, issue a `PATCH /api/issues/:id` that
changes the state to a completed category, and observe two things. The response
is a single coherent error, and the issue row is unchanged with `version` not
incremented. Repeat without the throwing consumer and confirm that the write and
the counter both land. Read the issue row back from SQLite directly rather than
trusting the API response, since the question is whether the write persisted.

A second observation covers the batch boundary. Run the same throwing consumer
against a 20-issue `POST /api/issues/bulk`. Observed end state: all 20 rows
unchanged, because the flush happens once at the outermost call and the rollback
takes the whole batch with it.
