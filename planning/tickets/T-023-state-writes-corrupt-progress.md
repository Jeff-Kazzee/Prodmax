# T-023 — workflow state writes corrupt project progress

status: open
module: M1 data and API core
assignee: —
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
