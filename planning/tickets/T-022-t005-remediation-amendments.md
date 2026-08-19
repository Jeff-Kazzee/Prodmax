# T-022 — T-005 remediation spec amendments

status: open
module: planning docs
assignee: —
owns: planning/architecture.md, planning/tickets/T-005-projects-api.md, planning/tickets/README.md
depends-on: T-005 (claimed, review complete)

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Amend the binding docs so the T-005 remediation can proceed. Plan:
`planning/plans/t005-remediation/overview.md`. Findings and evidence: the T-005
work log. This ticket is docs only. No code changes. It exists because §8 line 871
says a module needing a change inside another module's files files a constraint
amendment and never edits the file directly, and four of the five blocking fixes
land in M1-owned `src/lib/services/issues*.ts`.

## docs-to-read
- architecture.md §2.4 (projects/cycles tables), §3 (error shape), §3.5 (M4
  endpoint list), §8 (module boundaries, overlap rule), §9 (counter designs)
- planning/tickets/T-005-projects-api.md, the whole work log
- planning/plans/t005-remediation/overview.md, the alternatives table

## Deliverables

1. **Constraint amendment, M1 to M4.** Record in §8 that the T-005 remediation
   may edit `src/lib/services/issues-events.ts`, `issues-update.ts`, `issues.ts`,
   `issues-bulk.ts`, and `issues-history.ts`, and extend T-005's `owns:` line to
   match. T-002 completed M1's issue services and no other ticket owns them
   today.

   Without this, the remediation repeats the mistake that caused the bug.
   T-005 invented an import-side-effect registration to avoid touching an M1 file,
   and that registration is never armed in production.

2. **§2.4, `progress_points_cache` shape.** Amend the column note from
   `json {done, total} estimate-weighted` to
   `json {done, total, issuesDone, issuesTotal}` where `done`/`total` stay
   estimate-weighted and the two new fields hold live issue counts.
   `progress_cache` remains the rounded percent and becomes derived from
   `issuesDone`/`issuesTotal`. Rationale in the plan's alternatives table: a
   you cannot increment a percent, so O(1) needs the counts stored. Putting
   them in the existing TEXT column avoids a migration that would have to
   serialize against the T-007 docs chain.

3. **§9 row 3, counter design.** The current wording, "materialized counters with
   invalidation ... updated in the same service write", led T-005 to
   recompute on write, which costs O(rows in project) per issue mutation. Restate it
   as an incremental delta: the mutation event carries before and after state, the
   consumer applies increments, and a full recompute exists only as a named repair
   and backfill path that never runs on the write path. Keep the existing budget
   line.

4. **§3.5, cycles list route.** Amend the row from
   `GET /api/teams/:teamId/cycles` to `GET /api/cycles?wsId=&teamId=`. M4 owns
   `src/pages/api/cycles/**` and M1 owns `src/pages/api/teams/**` per §8 line 860,
   so the team-scoped path would straddle two modules permanently. T-005 already
   ships the flat route and explained the change in a code comment, which is not
   an amendment. T-006 codes against §3.5, so the doc has to be the truth.

5. **§3 error status for VALIDATION.** `src/lib/services/cycles.ts` returns 422
   with code `VALIDATION` on the cycle scope conflict, and `src/lib/api/errors.ts`
   maps `VALIDATION` to 400 and calls the mapping binding. One test asserts 422 (`tests/api/cycles.test.ts:181`), plus a test title at :161 and a docstring at `src/pages/api/cycles/[id]/scope.ts:4`.
   Pick one and write it down. Recommended: keep 400 and change the code and the
   one assertion, its test title, and the docstring, because 422 appears nowhere
   else in `src/` and a client branching on
   the §3 table does not expect it.

6. **Delete the self-authorized comments.** Once 4 lands, remove the constraint
   note at the top of `src/pages/api/cycles/index.ts`. Once the plan's phase 3
   lands, remove the "known gap" paragraph at
   `src/lib/services/projects-progress.ts:67-75`. Both currently record a
   deviation in a place no reviewer reads.

7. **Index.** Add T-022 to the table in `planning/tickets/README.md`.

## Acceptance

Every deviation that T-005 recorded in a code comment appears in the binding docs
instead. §2.4, §3.5, §8, §9, and the §3 error table read consistently with the
remediation plan.

A reader of §9 alone cannot arrive at the recompute-on-write
design T-005 shipped. This ticket touches no source, but run
`npm run check` to confirm no stray source edit slipped in.
