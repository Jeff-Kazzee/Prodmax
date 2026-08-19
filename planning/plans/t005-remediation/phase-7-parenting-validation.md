# Phase 7: cross-workspace parenting validation

Back to [overview.md](overview.md).

## Goal

An issue can only be parented to a project, milestone, or cycle in its own
workspace. This is the root fix behind the cross-tenant counter write.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. This phase edits
`src/lib/services/issues.ts`, `src/lib/services/issues-update.ts`, and
`src/lib/services/issues-helpers.ts`, all M1-owned.

## Changes

`createIssue` accepts `projectId`, `milestoneId`, and `cycleId` from the request
body and writes them straight into the insert. `updateIssue` does the same on
patch. Neither checks that the referenced row is in the caller's workspace. The
foreign keys only require the row to exist somewhere in the database, so a member
of workspace A can attach an issue to a project in workspace B. That is how a
foreign project id reaches `affectedProjectIds` and then the counter write the
T-005 work log records as finding 4. Phase 2 hardened the query. This phase stops
the id at the door.

**`src/lib/services/issues-helpers.ts`.** Three lookups join `requireTeamInWorkspace`
and `requireStateOnTeam`, which already live here. Each resolves the row by
primary key with a workspace predicate and rejects soft-deleted rows, matching
what `requireProject` in the projects service already does.

**`src/lib/services/issues.ts`, `createIssue`.** Each of the three fields is
validated before the insert, and only when the field is present in the input.

**`src/lib/services/issues-update.ts`, `updateIssue`.** Same three fields,
validated before the patch object is built, and only when the field is present
in the input. Validating before the patch is built matters, because
`recordFieldChange` runs inside that block and a rejected id must not leave a
history row behind.

**Failure shape.** A missing or foreign id raises `VALIDATION`, which maps to 400
under the §3 table and stays 400 after T-022 deliverable 5. `details` names the
offending field and id. `updateCycleScope` already uses exactly this shape for
issues that do not belong to a cycle's team, so this follows the closest
precedent in the codebase rather than inventing one. It also leaks nothing,
because the message says the id is not valid for this workspace and never says
whether it exists elsewhere.

**Out of scope, stated so nobody assumes otherwise.** This phase validates
workspace membership and liveness only. It does not check that a cycle belongs to
the issue's team, or that a milestone belongs to the issue's project. The
team-consistency rule stays where it lives today, inside `updateCycleScope`.
Extending it to the issue write path is a behavior change, not a tenancy fix.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

**Runtime.** This is the cross-tenant repro. Run it against a served build.

1. `npm run db:migrate && npm run seed`, `npm run build`,
   `npm run preview -- --port 4321`.
2. Create workspaces A and B with separate members. Create a project in B and
   note its id and its `progress_cache`.
3. As A's member, `POST /api/issues?wsId=<A>` with B's project id in the body.
4. Repeat as a `PATCH /api/issues/:id` on an existing issue of A.
5. Observed end state: both calls return 400 with the §3 body
   `{"error":{"code":"VALIDATION", …}}`, no issue in A carries B's project id,
   and B's `projects` row read directly out of `data/prodmax.db` is unchanged.
   Before this phase both calls return 200 and B's counters move.
