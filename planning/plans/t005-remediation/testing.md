# Testing strategy

Back to [overview.md](overview.md).

Four tests gate this plan and one honest limitation frames all of them. The
ordering repro is the acceptance test for phase 4. The guest-role matrix is the
acceptance test for phase 1. The source-tree gate and the property-based counter
test back phases 5 and 11. None of the four existing gates can see the phase 4
bug, which is why the repro exists at all.

## The ordering repro, phase 4

The bug is that `onIssueMutation(syncProjectProgress)` runs as an import side
effect and no issue-write path imports the module holding it. A test that
observes it has to avoid arming the hook by accident. Four constraints do that,
and each one is load-bearing.

**Seed the project and the issue directly in SQLite.** Creating them over HTTP
would serve `POST /api/projects`, and that route imports the projects service,
which imports `projects-progress`, which arms the hook. Seeding through
`data/prodmax.db` with better-sqlite3 puts the fixture in place without loading
any M4 module into the server process.

**Start a fresh server process on a port nothing else is using.** The
registration is process-wide and permanent once it happens. A reused server may
already have served a projects route in an earlier run, in which case the hook is
armed and the bug is invisible.

**Complete the issue over HTTP through `/api/issues/:id`, and serve no projects
route before it.** This is the production path the bug lives on. The `PATCH` sets
the issue's state to one in the `completed` category. No `GET /api/projects`, no
`GET /api/projects/:id`, no cycles route, nothing under `/api/projects/**` may be
requested before this step.

**Read `progress_cache` directly from SQLite, not through the projects API.**
Reading through `GET /api/projects/:id` would import the projects service and arm
the hook. That does not retroactively fix the missed mutation, but it does change
the process state under test, and any follow-up assertion in the same run would
then pass for the wrong reason. Open `data/prodmax.db` read-only and select the
column.

**Expected result.** Fails before phase 4 with `progress_cache` at 0. Passes
after with `progress_cache` at 100. A fix for a bug with no failing repro does
not ship.

**Where it lives, and why it is not a Playwright spec.** An earlier draft put it
under `tests/e2e/` with `reuseExistingServer` disabled for its own run. That is
not expressible. `webServer` is a top-level field in `playwright.config.ts`, and
`reuseExistingServer` is one key inside it. Playwright has no per-spec override
for either. Setting `reuseExistingServer: false` in the config flips it for the
whole suite, so all 8 existing specs pay a cold server start on every run, and it
still would not guarantee a process that has served nothing, only one Playwright
started itself.

So the repro is a standalone Node script that spawns its own server on its own
port, waits for it to answer, drives the sequence above over `fetch`, reads the
database file directly, and kills the child by PID on the way out. Vitest runs
it, so it lands inside the `npm test` gate rather than needing a new script entry
in the M0-owned `package.json`. It lives at `tests/api/projects-ordering-repro.test.ts`,
which is inside T-005's `owns:` line. Nothing it imports touches `src/`, because
the process under test is the child, not the test runner.

Picking its own port matters as much as the fresh process. Port 4321 is what
`npm run dev` and the Playwright config both use, so a repro hard-coded to 4321
can silently attach to a developer's already-warm server and pass against a tree
that still has the bug.

## The guest-role matrix, phase 1

One vitest file under `tests/api/`, asserting directly against §7 lines 840 to
842. Those three rows deny guests on manage projects and milestones, on posting
project updates, and on managing cycles.

The matrix has one case per endpoint group, and each case asserts both halves.

| Group | Guest write | Guest read |
|---|---|---|
| Projects, `POST /api/projects`, `PATCH` and `DELETE /api/projects/:id` | 403 FORBIDDEN | 200 |
| Milestones, `POST /api/projects/:id/milestones`, `PATCH` and `DELETE /api/milestones/:id` | 403 FORBIDDEN | 200 |
| Project updates, `POST /api/projects/:id/updates`, `DELETE /api/project-updates/:id` | 403 FORBIDDEN | 200 |
| Cycles, `POST /api/cycles`, `PATCH /api/cycles/:id`, `POST /api/cycles/:id/scope`, `POST /api/cycles/:id/close` | 403 FORBIDDEN | 200, own teams only |

Every write case asserts the §3 error shape, not just the status, and asserts
that the underlying row is unchanged afterwards. The cycle close case matters
most, because closing is irreversible.

The read cases assert that phase 1 did not overreach. A member and an admin run
the same matrix and get 200 on every row, so the test fails if `minRole` lands on
the wrong handler. The cycles read case additionally asserts that a guest sees
cycles for their own teams and not for a team they do not belong to, which is
§7 line 820's team-scoping rule and is already enforced by
`assertCycleTeamAccess`.

`tests/api/helpers.ts` supplies the fixture. It builds a fresh migrated database
per test and calls the route handlers directly with real `Request` objects, so
the matrix needs no server.

## The source-tree gate, phase 11

A vitest assertion that greps `src/` for writes to the `issues` table and fails
on any outside `src/lib/services/issues-events.ts`, which holds the writer. No
type can forbid calling Drizzle directly, so this is the only thing standing
between the choke-point and a future author who bypasses it.

It reports 11 violations against the tree today and exactly one after phases 3,
4, 5, 6, and 9 land. That one is line 88 of
`src/pages/api/states/[id]/index.ts`, which
`planning/tickets/T-023-state-writes-corrupt-progress.md` owns. The gate asserts
the exact count and names the allowed file. It is not a threshold that can be
raised. Phase 11 carries the reasoning.

## The property-based counter test, phase 5

The delta path has more cases than a scripted test finds. The generator emits a
random sequence of creates, state changes across all four categories, project
moves, estimate edits, cancels, trashes, and undos, and after every single step
asserts that the incremented cache equals what `repairProjectProgress` computes
for the same project.

Two cases motivate it directly. A scripted sequence written from the design does
not cancel an issue, and the existing aggregate excludes the canceled category
from both totals. It also does not change the estimate on an issue that is
already done, which moves `done` and `total` together while leaving `issuesDone`
and `issuesTotal` alone. Both were live spec bugs in an earlier draft of phase 5.

The generator is hand-rolled from a seeded PRNG in the test file. Adding
`fast-check` edits the M0-owned `package.json` and would cost a second amendment,
which is the same reason the source-tree gate is a vitest assertion rather than a
script. A failing seed is printed so the case can be replayed by hand.

## What the existing suite cannot prove

Both gates were green while all five blocking defects were live. That is a
structural fact about the suites, not bad luck, and it does not improve on its
own.

**The e2e gate carries no evidence about this ticket.** The 8 passing specs live
in four files under `tests/e2e/`, covering the shell, the issues list, the issue
panel, and a smoke path. None of them touch projects or cycles. The ordering
repro does not change that, because it is not an e2e spec. The overview excludes
retrofitting the rest of the M4 surface.

**The unit gate arms the hook it is meant to test.** `tests/api/*.test.ts` import
the endpoint modules they exercise at the top of the file, and the projects
endpoint modules pull in `projects-progress`, which registers the listener at
module scope. Every issue-mutation test in the same process therefore runs with
the hook armed. The production process does not. No arrangement of unit tests can
see this bug, because the act of importing the module under test is the thing
that hides it. Phase 4 deletes the mechanism, so after it lands this paragraph
describes history rather than a live hazard.

**The O(1) acceptance test measures the wrong thing.** It counts prepared
statements. A full table scan is one prepared statement and passes. Phase 5
replaces it with a check that runs `EXPLAIN QUERY PLAN` over every statement the
write path prepares and fails on any scan of `issues`.

**The unit tests were written by the session that wrote the implementation**, so
they agree with it by construction. The three-model review that found these
defects read the code rather than the tests. Treat a green unit suite on this
ticket as evidence that nothing regressed, not as evidence that the behavior is
correct.
