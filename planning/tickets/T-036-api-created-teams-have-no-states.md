# T-036 : a team created through the API cannot hold an issue

status: done
module: M1 data & API core
owns: src/pages/api/teams/index.ts, src/lib/api/provision.ts, tests/api/teams.test.ts, tests/api/cycles.test.ts, tests/api/search.test.ts, tests/api/issues-more.test.ts
depends-on: none
assignee: claude-code session 2026-08-19 (fix/t-036-team-states)

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

Session 2026-08-19, branch `fix/t-036-team-states`, cut from `dev` at
`22235f5`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  314 files, 0 errors
PASS test   files: 64 passed (64) | tests: 410 passed (410)
PASS e2e    9 passed (10.6s)
ALL GATES PASS
```

Exit code 0, counts parsed.

### owns amendment, recorded

`owns:` gained `tests/api/cycles.test.ts`, `tests/api/search.test.ts` and
`tests/api/issues-more.test.ts`. This is not scope creep: the first two hold
fixtures that hand-seed states onto a team created through `POST /teams`, and
once the endpoint seeds them itself those inserts hit
`states_team_name_unique` and the suite goes red. The fix cannot land without
them. The third only carries a comment that becomes false.

### One correction to this ticket's own text

The ticket said "issue creation calls `ensureTeamCounter`". It does not.
Grepping every call site: `src/db/ids.ts` defines it, and only
`scripts/seed.ts` and `tests/db/identifiers.test.ts` call it. Nothing under
`src/pages/**` or `src/lib/**` does. Issue creation uses `allocateIdentifier`
in `src/lib/services/issues-helpers.ts`, which opens with its own
`INSERT OR IGNORE INTO team_counters`.

So an API-created team could already allocate an identifier: the counter
self-heals on first use. The missing counter row was never a second bug.
`seedTeamDefaults` writes it anyway, for parity with what provisioning has
always done, and the work log says plainly that no test pins that line because
no user-visible behaviour distinguishes it.

There is a real duplication behind this worth a later ticket:
`ensureTeamCounter` / `allocateIssueNumber` / `allocateIssueIdentifier` in
`src/db/ids.ts` reimplement `allocateIdentifier` in `issues-helpers.ts`, and
only the seed and one test use the `ids.ts` versions.

### What changed

`DEFAULT_STATES` and a new `seedTeamDefaults(tx, teamId)` are exported from
`src/lib/api/provision.ts`. Both creation paths call it, so there is one
definition of what a team needs rather than two that happen to agree.

`POST /api/teams` now wraps its insert plus the seeding in one transaction.
It had no transaction at all, so a failure part-way would have left a
stateless team, which is the original defect wearing a different hat.

Ordering is load-bearing and is preserved: the team row, then the states, then
the backfill pointing `teams.default_state_id` at "Todo". The two tables
reference each other.

### Falsification

| Mutation | Failure |
|---|---|
| `POST /teams` stops seeding | `expected [] to deeply equal [ { name: 'Backlog', …(2) }, …(4) ]` |
| same, via the issue path | `expected 400 to be 201` |
| `default_state_id` backfill removed | `expected null to be truthy` |
| same, seen from the issue | `expected 'Backlog' to be 'Todo'` |
| team insert moved outside the transaction | `expected 1 to be +0` |

A sixth mutation is worth recording because it did NOT fail the new tests, by
design. Shrinking `DEFAULT_STATES` to four entries changes both paths equally,
so a test that pins them to each other cannot see it. That is the correct
division of labour: seven existing tests catch it, including
`tests/api/workspaces.test.ts` "provisions owner membership, PRO team, 5
states, starter labels", which pins the list's content. The new test pins
agreement; the old ones pin the contents.

### Section 8 ownership gap, worth a checkpoint note

`src/lib/api/**` appears nowhere in the architecture section 8 ownership
table. M1's row lists `src/lib/{errors.ts,auth,crypto,scoping}.ts`, and
`src/lib/api/` holds eight files that all serve M1b endpoints. This is the
same class of gap the table already records for `.github/**`. Both files this
ticket touches there are M1's in practice, so no cross-module edit was needed,
but the table should assign `src/lib/api/**` to M1 at the next integration
checkpoint.

### Fixtures simplified

`tests/api/cycles.test.ts` and `tests/api/search.test.ts` no longer copy
states onto their second team. `tests/api/issues-more.test.ts` keeps its raw
SQL fixture, which exists so the move-team tests control the state ids they
assert on, but its comment no longer claims `POST /teams` fails to provision.

### Not done

`tests/api/guest-role-matrix.test.ts` creates a second team through the API
and files no issue in it, so it sidesteps the defect rather than working
around it. It could now file issues there and strengthen the guest scoping
matrix. Left alone: that is new coverage, not this ticket's repair.
