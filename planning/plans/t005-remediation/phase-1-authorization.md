# Phase 1: authorization

Back to [overview.md](overview.md).

## Goal

Every mutating endpoint in T-005 requires `member` or higher, so a guest can no
longer create a project, post an update, edit a milestone, or close a cycle.
Guest read access stays, scoped the way §7 line 820 scopes it.

## Blocked on

Nothing. This phase touches only M4-owned endpoint files.

## Changes

All 17 `requireWorkspace` calls in the ticket currently pass no `minRole`. Twelve
of them sit on a mutating handler and get `"member"` as the third argument. The
guard already supports it, `src/lib/api/guards.ts` ranks owner above admin above
member above guest, and `src/pages/api/states/**` and `src/pages/api/labels/**`
already pass it correctly. Nothing in the guard changes.

The twelve write sites:

- `src/pages/api/projects/index.ts`, POST.
- `src/pages/api/projects/[id].ts`, PATCH and DELETE.
- `src/pages/api/projects/[id]/milestones.ts`, POST.
- `src/pages/api/milestones/[id].ts`, PATCH and DELETE.
- `src/pages/api/projects/[id]/updates.ts`, POST.
- `src/pages/api/project-updates/[id].ts`, DELETE.
- `src/pages/api/cycles/index.ts`, POST.
- `src/pages/api/cycles/[id].ts`, PATCH.
- `src/pages/api/cycles/[id]/scope.ts`, POST.
- `src/pages/api/cycles/[id]/close.ts`, POST.

§7 lines 840 to 842 are the source. They deny guest on manage projects and
milestones, on posting project updates, and on managing cycles, which covers
scope, surgery, and close. Cycle close is irreversible, so it is the row that
makes this blocking rather than cosmetic.

**Guest read access, decided here.** The five remaining `requireWorkspace` calls
sit on GET handlers and keep passing no role. Guests may read. §7 line 820 grants
guests a team-scoped read on team-scoped entities and names cycles as one of
them, so a guest reading cycles sees only cycles of teams they belong to. That
filter already exists as `assertCycleTeamAccess` in `src/lib/services/cycles.ts`
and `listCycles` already calls it, so `GET /api/cycles` needs no change. Projects,
milestones, and project updates are workspace-scoped rather than team-scoped, so
a guest reads them workspace-wide. §7 grants no narrower rule for them and
inventing one here would be a new policy rather than a fix. The five read sites:

- `src/pages/api/projects/index.ts`, GET.
- `src/pages/api/projects/[id].ts`, GET.
- `src/pages/api/projects/[id]/milestones.ts`, GET.
- `src/pages/api/projects/[id]/updates.ts`, GET.
- `src/pages/api/cycles/index.ts`, GET.

`deleteProjectUpdate` in `src/lib/services/project-updates.ts` already restricts
to the author or an admin. That check stays. With the guard in place a guest can
no longer be the author of an update, so the two rules agree.

The acceptance test is a guest-role matrix, one case per endpoint group, described
in [testing.md](testing.md).

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass. Counts pasted into the T-005 work log.

**Runtime.** Build, then serve the app and drive the irreversible row over HTTP.

1. `npm run db:migrate && npm run seed`, then `npm run build`, then
   `npm run preview -- --port 4321`. Read the `Local:` line for the real port.
2. In `data/prodmax.db`, set the demo member's `workspace_members.role` to
   `guest` for the seeded workspace.
3. Log in as `demo@prodmax.dev` and `POST /api/cycles/:id/close?wsId=…` against a
   live cycle.
4. Observed end state: HTTP 403 with the §3 body
   `{"error":{"code":"FORBIDDEN","message":"Requires member role or higher"}}`,
   and the cycle row in `data/prodmax.db` still has `status` not equal to
   `completed` and `closed_at` still NULL. Before this phase the same call
   returns 200 and closes the cycle.
5. `GET /api/cycles?wsId=&teamId=` as the same guest still returns 200 for a team
   they belong to, which is the read half of the decision above.
6. Restore the role, then kill the preview server by exact PID per
   `planning/tickets/README.md`.
