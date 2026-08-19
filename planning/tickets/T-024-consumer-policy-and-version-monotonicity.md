# T-024 — consumer policy and version monotonicity, before T-016 lands

status: open
module: M1 data and API core, M8 realtime
assignee: —
owns: src/lib/services/issues-events.ts, src/lib/services/issues-bulk.ts, planning/architecture.md §5
depends-on: T-005 (done)

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Three questions the T-005 remediation deliberately did not answer. A cross-model
audit of that work raised all three. None of them break anything today, because
the progress counter is the only consumer and it is in-process and fast. All
three bite the moment T-016 or M9 adds the second one, and both are cheaper to
answer now than to retrofit.

Design context: `planning/plans/t005-remediation/design-decision.md`.

## 1. Every consumer is mandatory, synchronous, and inside the user's transaction

`runIssueWrite` flushes to `issueConsumers` before commit, and a consumer that
throws rolls the issue write back. That is the right trade for a materialized
counter, where a committed write with a stale cache is the exact state the
remediation existed to prevent, and `tests/api/projects-rollback.test.ts` proves
it holds.

The same policy applied to M9's webhook dispatcher would let a third-party
outage return 500 on every issue write. Applied to a T-016 consumer that pushes
to live SSE clients, it would send state that has not committed yet.

The remediation deleted the runtime registry on the grounds that §5 needs
`event_log` replay across a process restart, which a callback list cannot serve.
That argument is about replay and it still holds. It does not address the
wakeup path, and the design left no post-commit hook of any kind.

Decide the shape before T-016 needs it. The obvious candidate is a second tier
with declared semantics, post-commit and best-effort, so a consumer's
criticality is a property of where it is registered rather than a convention.
Do not reintroduce a general runtime registry, because that is the mechanism
that failed.

## 2. Undo moves `version` backwards

`restoreSnapshot` in `src/lib/services/issues-bulk.ts` restores `snap.version`,
so an issue's version is not monotone across an undo. §5 names `version` as the
field a client uses to decide whether an incoming patch is newer than what it
holds. After an undo, a client that saw the higher version ignores the restore,
and a client holding the pre-bulk row can write over post-undo state without a
conflict.

Two candidate answers. Undo bumps `version` forward rather than restoring it,
which keeps monotonicity and costs the property that undo returns the row to
exactly its prior bytes. Or `version` stops being the ordering key and §5 names
something else. The first is likely right and is a one-line change plus a test,
but it is a §5 decision, not an implementation detail.

## 3. Derived cycle status writes during reads

`syncDerivedStatus` re-derives and persists non-completed cycle status inside
`listCycles` and `requireCycle`, so `GET /api/cycles` issues UPDATEs, including
for a guest whose §7 row grants read only. Correct today and cheap, since it is
bounded by cycles per team and only writes on a real difference. Worth a
decision rather than an accident, because a read endpoint that writes is a
surprise for caching, for read replicas, and for anyone reasoning about guest
permissions.

## Acceptance

Each of the three has a written decision in the binding docs, and the two that
imply code have a test. Answering one "no change, and here is why" is a valid
outcome as long as the reason is recorded where the next reader finds it.
