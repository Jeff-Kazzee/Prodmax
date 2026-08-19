# T-023 — workflow state writes corrupt project progress

status: done
module: M1 data and API core
assignee: claude-code session 47ad9748, 2026-08-19
owns: src/pages/api/states/[id]/index.ts, tests/api/states*.test.ts, planning/architecture.md §8
depends-on: T-005 remediation phase 5 (needs `repairProjectProgress` to exist)

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Two handlers in `src/pages/api/states/[id]/index.ts` change what an issue
contributes to its project's materialized counters without writing the issue,
without bumping a version, without an event, and without any repair. Reads never
recompute per §9, so nothing self-heals. The counters stay wrong until someone
happens to edit an unrelated field on one of the affected issues.

Found by two independent design runners during the T-005 remediation architecture
pass, then verified against the tree. Outside the T-022 carve-out, which covers
only the five `src/lib/services/issues*.ts` files, so it needs this ticket.

## The two paths

**`PATCH /api/states/:id` can change `category`.** Line 55 writes
`patch.category = body.category` straight through. Moving a state from `started`
to `completed` instantly changes `issuesDone` and `pointsDone` for every project
holding issues in that state. This is the worse of the two, because
recategorizing a workflow state is a routine admin action rather than a rare one.

**`DELETE /api/states/:id` reassigns every issue in the state.** Line 88 runs
`db.update(issues).set({ stateId: fallbackId }).where(eq(issues.stateId, state.id))`
as one raw statement. No version bump, no history row, no event. The fallback is
the team default or an arbitrary sibling, so deleting a `completed` state can move
every issue in it into a `backlog` state and drop every affected project's
completion count with no trace.

## Why this matters beyond the two endpoints

Every delta-counter design is silently wrong after an admin edits a workflow
state, including the one chosen in `planning/plans/t005-remediation/design-decision.md`.
This is the strongest argument for keeping the full aggregate as
`repairProjectProgress` rather than deleting it, and it is why that function is
exported rather than private.

The raw write on line 88 is also the one violation that will remain after the
remediation's source-tree gate lands. That gate reports 11 violations across 5
files today and exactly one after phases 3 through 6 and 9. Until this ticket
closes, that single remaining report is the standing record of this defect rather
than noise to be suppressed.

## Deliverables

1. `PATCH /api/states/:id` calls `repairProjectProgress` for every project holding
   issues in the state, inside the same transaction, whenever `category` changes.
   No repair when only `name` or `color` changed.
2. `DELETE /api/states/:id` routes the reassignment through the issue-write
   choke-point so each issue gets a version bump, a history row, and a transition,
   or, if the volume makes that impractical, repairs every affected project inside
   the same transaction. Pick one and say which in the work log.
3. Both handlers wrapped in a transaction, so a repair failure cannot leave the
   state edited and the counters stale.
4. Tests. Create a project with issues in a `started` state, assert
   `progress_cache`, PATCH the state to `completed`, assert the cache moved.
   Repeat for DELETE with a fallback in a different category. Both must fail
   against the current tree.
5. Record the decision in architecture §9, that a write changing
   `states.category` or reassigning `issues.state_id` is a counter-affecting
   write and owes a repair.

## Acceptance

Both tests fail before and pass after. The source-tree gate from the T-005
remediation reports zero violations. All four gates green.

## Work log

### 2026-08-19, branch `fix/t-023-state-writes-progress`

**Files touched.** `src/pages/api/states/[id]/index.ts`,
`tests/api/states-progress.test.ts` (new), `tests/api/projects-choke-point.test.ts`,
`planning/architecture.md` §9.

**Deliverable 2: which option.** Took the first one, the issue-write
choke-point, not the repair-only fallback. The two are not equally acceptable
here, because deliverable 2's fallback keeps the raw `db.update(issues)` alive
and the Acceptance section requires the source-tree gate to report zero. Only
routing through the writer satisfies both. The consumer then folds the whole run
into one `UPDATE projects` per affected project, so the counters came out right
without new counter code.

**Per-row `w.write`, not `w.writeMany`.** The first draft used `writeMany` for
the batch UPDATE. That is wrong here: `stateTimestamps` reads each issue's own
`startedAt` and `completedAt`, so the patch is not uniform across the batch and
`writeMany` cannot express it. See the parity note below.

**`w.noteState(state)` is load-bearing.** The progress consumer resolves each
transition's state category by id at flush time, and flush runs at the end of
`runIssueWrite`, after the body has already deleted the state row. Without the
memo, the resolver throws `State not found while resolving category` and DELETE
returns 500. Falsified: removing that one line fails both DELETE tests.

**History rows.** Added via `recordFieldChange` per issue, matching the
`updateCycleScope` precedent in `cycles.ts`. The writer records transitions but
not history, so history is the caller's job on this path. Two details.
`recordFieldChange` suppresses inside `HISTORY_GRACE_MS`, so the test ages the
seeded rows past the 3-minute window rather than asserting a row the production
code is right to withhold. And history is written only for live issues, matching
`updateIssue`, which reaches only live rows through `requireLiveIssue`. Trashed
issues still get repointed, because the foreign key demands it, but they do not
generate audit noise.

**`cause` stayed `direct`.** A state deletion is arguably its own cause, but the
`IssueWriteCause` union lives in `src/lib/services/issues-events.ts`, which is
T-024's `owns:` file. Left alone per the §8 overlap rule. Worth folding into
T-024 if that ticket touches the union anyway.

**Two scope notes.**

1. `tests/api/projects-choke-point.test.ts` is outside this ticket's `owns:`
   list, but Acceptance requires the gate to report zero and that gate is a
   hard-coded inventory. Deleted the `KNOWN_VIOLATIONS` entry and dropped the
   total from 1 to 0, per that file's own rule that entries are deleted when a
   ticket lands and never edited upward. The map is now empty.
2. The `owns:` line says `planning/architecture.md §8` but deliverable 5 says
   §9. Wrote §9: it is the counter-design section and row 3 is the incremental
   counter design this rule qualifies. §8 was left untouched.

**One test was too weak as first written.** "PATCH of name or color leaves the
cache untouched" compared the cache before and after, which cannot fail.
`repairProjectProgress` is idempotent, so an unnecessary repair rewrites the
same numbers and the assertion passes anyway. Rewritten to degrade the cache to
the legacy two-field shape first, so only a repair restores four fields and the
surviving shape is the assertion. Falsified: disabling the `recategorized`
guard now fails it with `expected { done: 4, total: 4, …(2) } to deeply equal
{ done: 4, total: 4 }`.

**Falsification of the two defect fixes** was the real pre-fix tree, not a
synthetic break: the tests were written first and run against `dev`. PATCH
failed with the cache stuck at `percent: 0, issuesDone: 0` after recategorizing
to `completed`. DELETE failed with the cache stuck at `percent: 100,
issuesDone: 2` after every issue moved out of `completed`, and the version test
failed `expected 1 to be 2`.

### Cross-model review round, four reviewers on the diff

Run before the PR per the project's pstack routing. Three findings changed the
code, and all three were things the first draft got wrong.

**1. PATCH compared against a stale snapshot, reintroducing the defect.**
`loadState` reads the state row, then `parseBodyOptional` suspends on
`await request.text()`, and the `recategorized` guard then compared the body
against that pre-await snapshot. Two concurrent PATCHes on the same state
interleave at the suspension: the second resumes holding the old category, sees
no change, and skips the repair the first one just made necessary. Result is a
state reading `started` with counters saying `completed`, which is exactly the
corruption this ticket exists to remove, reintroduced inside the optimization
added to avoid needless repairs. Fixed by re-reading the state row inside the
transaction and computing `recategorized` from the fresh value. Test-covered,
using a seam the fourth reviewer built: a request whose body is a
`ReadableStream` runs the competing writer inside `pull`, which is exactly the
suspension. Falsified: comparing against the snapshot rather than the re-read
fails with `expected { percent: 100 } to deeply equal { percent: 0 }`, a cache
reading fully done over a state reading `started`.

**2. The reassignment was a counter-grade write but not a state-grade one.**
`updateIssue` does four things on a state change: `noteState`,
`recordFieldChange`, `stateTimestamps`, and `downgradeBlockersIfResolved`. The
first draft did the first two. So an issue leaving a `completed` state kept its
`completedAt`, landing as an unstarted issue carrying a completion date, and an
issue landing in a `completed` fallback never downgraded its blocks (FM-016).
Nothing self-heals those columns any more than it heals the counters. Fixed by
switching to per-row `w.write` with the timestamp patch and the blocker
downgrade, both guarded to live issues to match `updateIssue`.

**3. Deliverable 3 had no test.** The transaction was the diff's own binding
claim, restated in architecture §9, and deleting the wrapper left every test
green. Now covered both ways by a SQLite trigger that aborts any `projects`
UPDATE, which makes the repair fail on the real production path with no mocking
and no test-only seam. `withIssueConsumers` cannot serve here: it refuses async
callbacks by design and every route handler is async, which is why
`projects-rollback.test.ts` drives services rather than handlers.

**The same weak-assertion mistake, twice.** Worth recording because the second
one was mine after being warned about the first. Asserting the reassignment
clears `completedAt` passed with the `stateTimestamps` spread deleted, because
`createIssue` never sets `completedAt`, so the column was already null and
`toBeNull()` proved nothing. The test now seeds a non-null `completedAt` first.
Falsified after the fix: removing the spread fails with
`expected 1787167479657 to be null`.

**Other assertions strengthened after the review.** The DELETE trace test
asserted `state_id` was merely not the deleted state, which every sibling
satisfies, and asserted a history row count above zero, which passes with the
old and new values reversed or a wrong actor. Now asserts the fallback equals
the team default, exactly one history row, both values parsed and compared, and
the actor. The PATCH test gained a trashed issue and a project-less issue in the
same state, so the two filters in `projectsHoldingIssuesIn` are load-bearing.

**Falsifications run this round.** Disabling the `recategorized` guard fails the
rename test. Removing `w.noteState(state)` fails both DELETE tests with
`State not found while resolving category`. Removing the `stateTimestamps`
spread fails the trace test. Replacing the PATCH transaction with a plain IIFE
fails the rollback test with `expected 'completed' to be 'started'`.

**Response shape.** DELETE now returns `{ok, reassigned, fallbackStateId}`.
Nothing else tells a client that deleting a state moved n issues or where they
went, and there is no undo token because the state row is gone.

**Triage branch, preserved and not fixed.** Two reviewers independently found
that repointing `triageStateId` also clobbers the issue fallback, so issues land
on the new triage state rather than the team default, and that when only triage
pointed at the deleted state the `.find` compares against `undefined` and
discards a perfectly valid default. Both are pre-existing and unreachable:
nothing in `src/` writes `triageStateId`. Preserved verbatim with a comment
saying so, because changing behavior in unreachable code is a change no test can
justify.

**Filed, not fixed.** [T-025](T-025-seed-writes-stale-progress-caches.md), the
seed hand-writes both project caches in the legacy two-field shape, verified at
`scripts/seed.ts:240` and `:260`, and `repairAllProjects` has no callers.
[T-026](T-026-harden-the-counter-write-gate.md), the choke-point gate catches
two write shapes out of fifteen probed, never scans `scripts/`, and does not
watch `states.category` at all, which is the exact class this ticket fixes. The
zero this ticket earned is real for raw `issues` writes in `src/` and proves
less than the Acceptance section implies.

### Fourth reviewer, executed rather than read

Sixteen adversarial probes against the committed tree, and it could not break
the fix. Verified by execution, not argument: the generated `groupBy` SQL and
its rows, DELETE rollback under a throwing consumer, PATCH rollback under a
SQLite `RAISE(ABORT)` on `projects`, reassign-before-delete being provably
required under `foreign_keys = ON`, `PRAGMA foreign_key_check` clean afterward,
all five triage team shapes leaving nothing pointed at the deleted state, and
every project cache equal to an independent from-scratch recompute across ten
differential-oracle configurations.

Three findings landed as code. The TOCTOU seam above. One `SELECT` per issue
saved by hoisting the `fallbackResolves` check out of the loop, since
`downgradeBlockersIfResolved` re-reads the state on every call and is a no-op
unless the fallback resolves the issue. And a comment recording that trashed
rows are deliberately silent in history while still being repointed.

Measured cost after the per-row change: 300 issues in 167 ms, 300 issue UPDATEs
folding to one `UPDATE projects`, which is the consumer design working.

**One finding was about my process, and it is fair.** The reviewer was handed a
diff and I kept editing the tree underneath it, so it spent probes chasing a
defect I had already fixed mid-review. A review artifact should be a frozen
commit, not a working tree. Next time: commit first, review the commit.

**Not fixed, judged not worth it.** The workspace predicate on the `befores`
query turns a hand-corrupted cross-workspace row into an opaque 500 rather than
silently repointing it. Reaching it requires corrupting a row directly, since
`state -> team -> workspace` already determines the workspace, and failing loudly
inside a transaction is the better of the two outcomes.

**Known limit, not fixed.** DELETE now runs one UPDATE and one SELECT per issue
rather than one batched pair, plus one history INSERT per live issue, all inside
a single write transaction. PATCH runs one full aggregate per affected project.
Both are linear and unbatched. Left that way deliberately: a workflow state
holding tens of thousands of issues is not a shape this product has, the repo has
no chunking precedent to follow, and adding one would be a loop no test can
justify.
