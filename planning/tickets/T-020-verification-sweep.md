# T-020 — Phase C verification sweep (epic)

status: open
module: verify
assignee: —
owns: planning/qa/defect-log.md, tests/e2e/** (fix specs), tests/** (gap fills)
depends-on: T-002…T-019

> Read `planning/tickets/README.md` first. EPIC: when picked, split into
> per-group sweep tickets (G1..G22 of acceptance-tests.md) and work them
> in order. This is the exit gate of the whole build.

## Deliverables

- Drive the RUNNING app (npm run dev/preview + chrome-devtools MCP or
  Playwright) against AT-001…AT-126, group by group.
- Every failure → entry in planning/qa/defect-log.md (id, AT ref, repro,
  suspicion, fix, retest result) — fix→retest loop until zero material
  defects; cosmetic notes listed separately.
- Update each AT's status in acceptance-tests.md if it carries one, and
  the coverage matrix.

## Acceptance
All 126 ATs pass or are explicitly waived with rationale; all four gates
green; defect log shows zero open material defects.
