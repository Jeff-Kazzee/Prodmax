# T-032 : a cycle can be patched but not fetched

status: open
module: M4 projects & cycles
owns: src/pages/api/cycles/[id].ts, src/lib/services/cycles.ts, tests/api/cycles*.test.ts
depends-on: none

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-006.

## What is missing

`src/pages/api/cycles/[id].ts` exports `PATCH` only. Every other entity in the
API has a GET for one row: projects, issues, milestones through their list,
views, teams. Cycles do not. Architecture §3.5 lists
`PATCH /api/cycles/:id` and never a GET, so this is a spec gap as much as an
implementation one.

## What it costs today

R-21 is `/cycle/:id`, a deep link and a shareable URL. With no single-cycle
GET, `useCycles` in `src/island/features/cycles/use-cycles.ts` resolves it by
listing cycles per team and searching:

- with `?team=` it lists that one team and finds the id in the page;
- without it, it fans out with `Promise.all` over every cycles-enabled team
  and scans each response.

So a cold link to a cycle costs one request per eligible team. That is fine
for the demo bench with one team and gets worse linearly. It also swallows
information: a guest hitting a team they do not belong to gets a NOT_FOUND from
`assertCycleTeamAccess`, which the fan-out has to treat as "not here" rather
than as an error, so a genuine failure and a miss look identical.

## Deliverables

1. `GET /api/cycles/:id?wsId=` returning the same `CycleDto` the list serves,
   including the frozen `stats` for a completed cycle and live stats
   otherwise. Reuse `statsFor`; do not write a second stats path.
2. Guest access identical to the list: `assertCycleTeamAccess`, 404 for a
   cycle of a team the caller cannot see, no leak of existence (§7).
3. API tests: active cycle, completed cycle serving its snapshot, a cycle in
   another workspace, and a guest outside the team.
4. Collapse the fan-out in `src/island/features/cycles/use-cycles.ts` to one
   request, and keep `?team=` working as the team selector for R-20.
5. Amend architecture §3.5 to list the route.

## Acceptance

`/cycle/:id` issues exactly one cycles request with no `?team=` present, on a
workspace with several cycles-enabled teams. All four gates green.
