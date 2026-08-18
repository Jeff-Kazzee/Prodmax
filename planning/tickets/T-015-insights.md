# T-015 — M7 Insights

status: open
module: M7 insights
assignee: —
owns: src/pages/api/insights/**, src/features/insights/**, src/island/features/insights/**, tests/api/insights*, tests/island/features/insights*
depends-on: T-005

> Read `planning/tickets/README.md` first. Swaps `/insights` (R-26).

## docs-to-read
- architecture.md §3.9 (insights endpoints), §2.4 (stats_snapshot,
  progress caches — your data sources; NEVER scan issues at render per
  §9), feature-matrix FM-058..061
- ux-spec.md §4.21 (S-21), design-system chart specs (dither-kit usage if
  specified; zero new deps unless dither-kit is already present)

## Deliverables

- Endpoints: velocity (issues completed over time from completed_at —
  materialized/cached per window), throughput, cycle burndown (from
  stats_snapshot + scope), backlog health (age buckets), workload
  distribution (per assignee). All workspace-scoped, cache-friendly
  (recompute on write invalidation or 5-min window — match §9 rules).
- S-21 screen: range + team filters; velocity chart; cycle burndown;
  backlog aging; workload; all rendered from cached aggregates (assert no
  O(issues) queries at render — prepared-statement counter in tests).
- Empty/loading/error states per §3.0; skeleton S-charts.

## Acceptance
Vitest aggregate correctness vs seeded data + query-count budget; RTL
chart rendering from fixtures. All four gates green.
