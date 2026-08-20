# T-036 : a team created through the API cannot hold an issue

status: open
module: M1 data & API core
owns: src/pages/api/teams/index.ts, src/lib/api/provision.ts, tests/api/teams.test.ts
depends-on: none
assignee: none

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-007, by trying to put a second team in a search
permission fixture.

## What happens

`POST /api/teams` inserts the team row and returns 201. It writes no workflow
states. `src/lib/api/provision.ts` seeds five states, but only for the default
team it creates alongside a new workspace, so the two paths that produce a team
disagree about what a team is.

The result is a team that looks created and cannot be used:

```
teamStatus=201  newTeamStates=0  defaultTeamStates=5
issueStatus=400  {"error":{"code":"VALIDATION","message":"Team has no workflow states","details":[]}}
```

Observed against a fresh migrated database: create a workspace, `POST /teams`
with `{name:"Other", key:"OTH"}`, then `POST /issues` with that `teamId`.

## Why it matters

Filing an issue is what a team is for. Every team after the first is dead on
arrival, and the error surfaces at the point of filing rather than at the point
of creation, so the message blames the issue rather than the team.

It also blocks a whole class of test fixture. Any test needing two teams (guest
team scoping, cross-team moves, per-team cycles) has to hand-insert states with
raw SQL. `tests/api/search.test.ts` does exactly that today and says so in a
comment, and `tests/api/guest-role-matrix.test.ts` avoids the problem by never
filing an issue in its second team.

The M1 team endpoints predate the issues engine, which is the likely reason:
when `POST /teams` was written, nothing yet required a team to have states.

## The fix

Seed the same five states, in the same transaction as the team insert, from
one definition shared with `provision.ts`. Two call sites producing different
team shapes is the actual defect; adding a second copy of the state list to
`teams/index.ts` would leave it.

`src/lib/api/provision.ts` already holds the list. Extract it to a named
export, have both callers use it, and insert the states inside the team
transaction so a failure cannot leave a stateless team behind.

Consider whether `POST /teams` should also create the `team_counters` row.
`ensureTeamCounter` exists in `src/db/ids.ts` and issue creation calls it, so
this is probably already safe, but it belongs in the same audit.

## Acceptance

- `POST /api/teams` produces a team whose state set equals the default team's,
  asserted by comparing the two sets rather than by counting to five, so the
  two paths stay pinned to each other.
- Creating an issue in an API-created team succeeds without any fixture SQL.
- `tests/api/search.test.ts` drops its hand-seeded states and its comment.
- All four gates green.

## Work log

(empty)
