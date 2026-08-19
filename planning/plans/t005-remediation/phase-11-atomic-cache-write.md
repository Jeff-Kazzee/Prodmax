[Back to overview](overview.md)

# Phase 11 — cache write atomic with the issue write

## Goal

Make the counter update part of the same transaction as the issue write, and stop
a listener failure from returning 500 on a mutation that already committed.

## Blocked on

T-022. This phase edits M1-owned `src/lib/services/issues-update.ts` and
`issues.ts`.

## Changes

`updateIssue` runs inside no transaction at all. The history inserts, the label
replace, the issue `UPDATE`, and the listener call are four separate implicit
transactions. A crash between the issue write and the listener leaves the counter
stale, and because reads never recompute, nothing repairs it.

`createIssue` wraps its insert in a transaction but calls `recordIssueMutation`
after that transaction commits, so it has the same gap in a narrower window.

Wrap `updateIssue` in a transaction and move the `recordIssueMutation` call inside
it in both functions. §9 requires the counter update in the same service write,
and a listener that runs after the commit is not that.

The pattern already exists in the tree. `bulkUpdateIssues` wraps the whole batch,
which is what makes the unwrapped single-issue path read as an oversight rather
than a decision.

Once the listener runs inside the transaction, a throw rolls the issue write back
instead of leaving the client with a 500 on a persisted change and a `version`
that already incremented. Decide explicitly whether a counter failure should fail
the issue write. Rolling back is the correct default under §9, because a committed
issue write with a stale counter is the state this whole plan exists to prevent.

## Data structures

None. This phase changes transaction boundaries only.

## Verification

Static. `npm run check` 0 errors, `npm test` 0 failures, `npm run build` clean,
`npm run e2e` all pass.

Runtime. Force the failure rather than reasoning about it. Register a listener that
throws, issue a `PATCH /api/issues/:id` that changes the state to a completed
category, and observe two things. The response is a single coherent error, and the
issue row is unchanged with `version` not incremented. Repeat with the listener
restored and confirm the write and the counter both land. Reading the issue row
back from SQLite directly is the check, not the API response, since the point is
whether the write persisted.
