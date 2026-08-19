# T-005 — M4a Projects/cycles API

status: done
module: M4 projects & cycles
assignee: kimi-code-swarm 2026-08-19
owns: src/pages/api/projects/**, src/pages/api/project-updates/**, src/pages/api/milestones/**, src/pages/api/cycles/**, src/lib/services/{projects,project-updates,milestones,cycles}*, src/lib/validation/{projects,cycles}*, tests/api/{projects,cycles}*, and for the remediation only, per the §8 recorded amendment of 2026-08-19: src/lib/services/issues-events.ts, src/lib/services/issues-update.ts, src/lib/services/issues.ts, src/lib/services/issues-bulk.ts, src/lib/services/issues-history.ts
depends-on: T-002

> Read `planning/tickets/README.md` first. Schema exists (projects,
> project_updates, milestones, cycles in src/db/schema.ts).

## docs-to-read
- architecture.md §2.4 (tables + progress caches + rollover), §3.5
  (endpoint list), §9 (materialized counter rules)
- ux-spec.md §4.15–§4.16 (consumers)

## Deliverables

All 11 endpoints from §3.5: projects CRUD (+ lead, target dates, brief
page link, color, position), project updates (health, progress_snapshot),
milestones CRUD, cycles list/create/patch, `POST /api/cycles/:id/scope`
(add/remove issues), `POST /api/cycles/:id/close` (freeze stats_snapshot,
rollover open issues to next cycle per §2.4).

- Materialized `progress_cache` / `progress_points_cache` maintained in the
  SAME service write that changes an issue's completed state (O(1) per
  write, never recomputed on read — §9 counter-design). This requires a
  small hook into the issues service from T-002: add it as a call from the
  issue completion mutation choke-point; if that file is outside your
  owns-list, add the hook via an exported registration function and note
  the amendment (or coordinate — T-002's services were structured for
  exactly this).
- Cycle status derived+stored per §2.4; team-scoped UNIQUE(team_id,number).

## Acceptance
Vitest: project CRUD + progress cache updates on issue completion + O(1)
(no full scans — assert query count via prepare counting if practical),
update cadence + snapshots, milestone ordering, cycle create/scope/close +
rollover + stats freeze. All four gates green.

## Work log

### 2026-08-19 review pass (gates + adversarial review, no code changed)

Gates, all four green against the untracked working tree:
`npm run check` 0 errors / 0 warnings / 6 hints across 234 files.
`npm test` 160 passed in 36 files. `npm run build` clean in 17.26s.
`npm run e2e` 8 passed. Note that none of the 8 e2e specs touch projects
or cycles, so the e2e gate carries no evidence about this ticket.

Three-model adversarial review (pstack `/interrogate`, Opus + Fable +
Sonnet, read-only). Green gates are hiding spec violations. Status stays
`claimed`, not `in-review`, until the act-on list clears.

**Act on, blocking:**

1. The progress hook is never armed in production. `onIssueMutation(
   syncProjectProgress)` at `projects-progress.ts:121` runs as an import
   side effect, and no issue-write path imports that module. Confirmed in
   the built output: no chunk under `dist/server/pages/api/issues/**`
   pulls in the chunk holding the registration. `progress_cache` stays 0
   unless a projects route was served first in that process. Vitest hides
   it because the test file imports both endpoint modules at the top.
2. §9's O(1) rule is violated. `recomputeProjectProgress` runs a
   `count(*)` plus three `sum(...)` aggregates over every live issue in
   the project, on every issue mutation, including title and priority
   edits that cannot change progress. `bulkUpdateIssues` allows 200 ids,
   so one bulk action pays 200 full aggregates. The acceptance test
   counts prepared statements rather than rows, so a full scan reads as
   one query and passes. The module docstring asserting "O(1) indexed
   queries" is wrong.
3. Guests get write access to projects, milestones, project updates, and
   cycles. All 17 `requireWorkspace` calls in this ticket pass no
   `minRole`. Twelve of those 17 handlers are writes and need `member`, the other
   five are GETs. Architecture §7 lines 840 to 842 deny guest on exactly
   these rows. A guest can close a cycle, which is irreversible. The
   codebase already passes `minRole` correctly in states and labels.
4. `recomputeProjectProgress` has no workspace predicate on either the
   aggregate or the `UPDATE projects`, and `affectedProjectIds` feeds it
   a `projectId` taken straight from the request patch. A member of one
   workspace can overwrite another workspace's counters. Needs a uuid7 id
   from the target tenant, so treat it as a tenancy-invariant break
   rather than a live exploit.
5. Undo leaves caches permanently stale. `restoreSnapshot` rewrites
   `stateId`, `projectId`, and `deletedAt` by raw SQL, and `applyUndo`
   emits one event for `snapshots[0]` only. Every other affected project
   keeps counting issues it no longer owns, and reads never recompute, so
   nothing self-heals. `restoreIssue` emits nothing at all.

**Consider:** cycle `status` never advances from `future` to `active`
(derived only at create, patch, and close). Rollover and
`updateCycleScope` write `issues` without workspace scope and behind the
documented mutation choke-point, so history and T-016 SSE will miss them.
Next-cycle rollover picks by `number` while §2.4 describes it
chronologically. Cache writes are not in the same transaction as the
issue write, so a listener throw returns 500 on a committed mutation.
`leadId` and `briefPageId` accept ids from any workspace and a bad id
surfaces as 500 rather than the §3 error shape.

**Deviations found, both recorded only in code comments and never
filed:** §3.5 specifies `GET /api/teams/:teamId/cycles` and the code
serves `GET /api/cycles?wsId=&teamId=`. The 3-minute history grace
window leaves the old project's cache stale after a create-then-reproject,
and the test backdates `created_at` to step around it.

### 2026-08-19 remediation complete (phases 1 to 11)

All eleven phases landed. Gates: `npm run check` 240 files, 0 errors, 0
warnings, 6 hints. `npm test` 193 passed in 43 files, up from 160 in 36 at the
baseline. `npm run build` clean. `npm run e2e` 8 passed.

**The five act-on findings, each with the evidence that closed it.**

1. The progress hook never armed in production. Fixed by deleting the runtime
   registry. Consumers are now a `Record` over a closed union, so an unwired
   one fails `astro check`. Proven by `tests/api/projects-ordering-repro.test.ts`,
   which seeds SQLite directly, spawns a fresh server on its own port, completes
   an issue over HTTP with no projects route served first, and reads the column
   out of the file. It fails on the baseline with `expected +0 to be 100`.
2. The O(1) rule was violated by a full aggregate on every write. The consumer
   now applies a delta over counted-set membership. A 200-issue bulk into one
   project is one `UPDATE projects`. A 1,000-issue cycle scope call is zero
   queries, because the gate rejects every cycle-only transition before any
   work.
3. Guests could write to every endpoint in the ticket. Twelve write handlers
   take `minRole: "member"`, the five GETs stay open per §7 line 820. Proven
   over HTTP: on the baseline a guest closed a cycle and got 200, on this tree
   403 and the row is unchanged.
4. Counters could be written across tenant boundaries. Every read and write in
   the consumer carries a workspace predicate, and `leadId` and `briefPageId`
   are validated against the workspace.
5. Undo left caches permanently stale. Every restored issue emits its own
   faithful transition. The synthetic `snapshots[0]` and `ids[0]` events are
   gone, and they are no longer constructible.

**What made the review worth running.** All four gates were green before any of
this. The e2e suite has 8 specs and none touch projects or cycles, so it carried
no evidence about this ticket. The acceptance test for the O(1) budget counted
prepared statements rather than rows, which a full table scan passes.

**Three artifacts outlive the fix.** The ordering repro. The source-tree gate at
`tests/api/projects-choke-point.test.ts`, which asserts an exact per-file
inventory of raw `issues` writes: 11 at the baseline, 1 now, and the one that
remains is the states endpoint T-023 owns. And a property test driven by a
seeded PRNG, mutation-checked against all three spec bugs the design review
found.

**Two spec bugs the design pass caught before implementation.** Repair then
increment double-counts, so the rule is repair instead of increment. And the
`canceled` category is excluded from both totals, which a delta described only
as crossing `completed` would have drifted on.

**Opened for follow-up.** T-023 for the workflow state endpoints. Dropping the
dead `teams.next_cycle_number` needs a migration ticket. The archived-issue
question in §2.4 needs a product decision. The e2e suite is not idempotent
against an accumulated `data/prodmax.db`.

### Correction, same day

The entry above originally claimed all eleven phases landed. Ten had. Phase 7,
cross-workspace parenting validation, was never assigned and never
implemented, and the overview's own gate said not to advance this ticket until
phases 1 through 7 were green. A cross-model audit of the decision trail caught
it, not the gates, which were green throughout.

Finding 4's closure statement was true only for the half it named. The counter
write was protected by phase 2's workspace predicate, so a foreign project id
could not move another tenant's numbers. The reference itself stood: a foreign
`projectId` on create returned 201 and stored silently, and on patch returned
200. Phase 7 now rejects all three parenting ids with `VALIDATION` at 400, and
three of its four tests fail with the guard removed.

Two hardening items landed with it. `runIssueWrite` refuses an async body, and
the source-tree gate catches raw SQL writes rather than only the Drizzle
builder.

Three questions the audit raised are filed as T-024 rather than fixed here. All
three are design decisions that bind T-016 and M9, and none of them break
anything while the progress counter is the only consumer.

Final gates: `npm run check` 242 files, 0 errors. `npm test` 197 passed in 44
files. `npm run build` clean. `npm run e2e` 8 passed.
