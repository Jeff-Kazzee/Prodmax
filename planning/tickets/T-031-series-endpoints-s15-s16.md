# T-031 : S-15 and S-16 want history no endpoint serves

status: open
module: M4 projects & cycles
owns: src/pages/api/projects/[id]/series.ts, src/pages/api/cycles/[id]/series.ts, src/lib/services/projects-progress.ts, src/lib/services/cycles.ts, tests/api/*.test.ts
depends-on: none

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-006. Three UI elements the spec asks for share one
cause: the API serves current state, and these need a time series.

## 1. PJ-06's 8-week sparkline

ux-spec §4.15 PJ-06 puts an 8-week sparkline in the project stats row.
Nothing records project progress over time. `projects.progress_cache` is a
scalar that the write path overwrites, so yesterday's value is gone.

Computing it on the client means scanning issues by `completed_at`, which is
exactly the read-time scan architecture §9 forbids on this screen and which
T-006's acceptance criterion tests against. The sparkline was therefore not
shipped, and neither was the blocked count beside it (see 3).

## 2. CY-05's scope line

ux-spec §4.16 CY-05 wants a burn-up with a real scope series. Nothing records
when an issue entered or left a cycle. `issue_history` records field changes,
so a `cycle` transition may be reconstructable from it, but that is a scan per
render and it only goes back as far as history does.

T-006 shipped `src/island/features/cycles/burn-up-chart.tsx` with a real
completed series, from each scoped issue's `completed_at`, and a scope line
held flat at today's total with a caption saying exactly that. The caption is
honest but the chart is not what the spec draws.

## 3. PJ-06's blocked count

Not a series problem, but the same shape of gap and it belongs in one place.
There is no blocked concept anywhere: no column, no aggregate, no relation
type that means it. `issue_relations` has `blocked_by` and `blocking`
(`src/lib/validation/issues.ts` relationTypeSchema), so "blocked" is derivable
as "has an unresolved `blocked_by` relation", but nothing computes it and
doing it per project on the client is another scan.

## Decide before building

Whether to snapshot or to derive. A nightly snapshot table is cheap to read
and lies between runs. Deriving from `issue_history` is always current and
costs a scan. Pick one, write down why, and make the endpoint's contract state
which it is, because a chart that silently changes meaning is worse than
either.

## Deliverables

1. The decision above.
2. `GET /api/projects/:id/series?weeks=8` returning progress over time.
3. `GET /api/cycles/:id/series` returning scope and completed per day.
4. A blocked count, either on the project payload or in the series response.
5. API tests including a project with no history at all, which must return an
   empty series rather than a fabricated flat line.
6. Wire the three UI elements: the PJ-06 sparkline and blocked count in
   `src/island/features/projects/tab-overview.tsx`, and the real scope line in
   `src/island/features/cycles/burn-up-chart.tsx`, deleting its flat-line
   caption in the same change.

## Also here: CY-02's headcount fallback

ux-spec §4.16 CY-02 says capacity falls back to member count labelled
"estimate from headcount" when fewer than three cycles have closed. There is
no team-members endpoint, only `GET /api/workspaces/:id/members`, so
`capacityEstimate` in `src/island/features/cycles/cycle-stats.ts` returns null
and the chip is omitted. Either add `GET /api/teams/:id/members` or state that
the workspace member count is the intended denominator.

## Acceptance

The sparkline and the burn-up scope line render from server data, and a
project with no history renders an empty state rather than an invented one.
All four gates green.
