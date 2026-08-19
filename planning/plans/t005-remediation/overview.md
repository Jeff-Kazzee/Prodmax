# T-005 remediation — overview

Status: draft, awaiting Jeff's approval
Author: Claude Code session, 2026-08-19
Source: T-005 work log (three-model adversarial review, gates green)
Amendment ticket: `planning/tickets/T-022-t005-remediation-amendments.md`

## Context

T-005 (M4a Projects/cycles API) shipped 2411 lines across 17 files with all four
gates green. `astro check` 0 errors, `vitest` 160 passed, build clean, `playwright`
8 passed. A three-model review found five blocking defects that the gates cannot
see. The full findings are in the T-005 work log. This plan is how they get fixed.

The gates were green for a structural reason worth naming. The e2e suite has 8
specs and none touch projects or cycles, so the runtime gate carries no evidence
about this ticket. The unit tests were written by the agent that wrote the
implementation, so they agree with it by construction. The acceptance test for the
O(1) budget counts prepared statements rather than rows, which a full table scan
passes.

## Root cause

Four of the five blocking defects share one cause. `IssueMutation` in
`src/lib/services/issues-events.ts` carries `{kind, workspaceId, issueId, actorId,
patch?}` and no before-state. Every downstream consequence follows from that
missing field:

- A consumer that cannot see what changed cannot compute a delta, so it recomputes
  from scratch. That is the O(1) violation.
- A consumer that needs the previous `projectId` has to read it back out of
  `issue_history`, which deliberately folds field changes inside its 3-minute
  create grace window. That is the stale-cache-after-reproject bug.
- `applyUndo` writes issues with raw SQL and emits one synthetic event for
  `snapshots[0]`, because emitting a faithful per-issue event would require
  before-state it does not have. That is the permanently stale cache after undo.
- Because the consumer could not be called from the choke-point without editing an
  M1 file, it registered itself as an import side effect instead. Nothing on the
  issue-write path imports it, so in production the hook is never armed.

The fifth defect, guests holding write access to every endpoint in the ticket, is
independent and mechanical.

The ownership boundary is what produced the workaround. §8 line 860 gives M1
exclusive ownership of `src/lib/services/**`, T-005 was carved a slice of that for
its own service files, and the issues services stayed M1. Rather than file the
amendment §8 line 871 requires, T-005 invented a registration indirection that
does not work. Fixing this properly means crossing into M1 files, which means
filing the amendment first.

## Scope

**Included.** All five act-on findings, the six consider-tier findings, and the two
deviations currently recorded only in code comments. The `IssueMutation` contract
change and every M1 call site it touches.

**Excluded.** T-006 (projects and cycles UI). Any change to `src/db/schema.ts`, see
the alternatives below. The T-016 SSE consumer, which this plan only makes
possible rather than building. Dropping the dead `teams.next_cycle_number`
allocator column, which needs a schema edit and a migration, so phase 10 records it
as dead and leaves removal to a future migration ticket. Retrofitting e2e coverage
for the whole M4 surface,
beyond the one ordering repro that proves phase 4.

## Constraints

- §8 line 871 forbids editing another module's files directly. Phases 3, 4, 6, 7,
  and 9 touch M1 issue services and are blocked on T-022 landing.
- §8 line 855 puts amendments at the integration checkpoint.
- Migrations serialize at the integration checkpoint per `planning/tickets/README.md`,
  so a phase that needs one is more expensive than it looks.
- `foreign_keys=ON` under WAL, per §9's pragma line. FK violations surface as
  `SqliteError`, which `route()` turns into a bare 500 unless caught earlier.
- The four gates in `AGENTS.md` are the definition of done for every phase.

## Alternatives for the O(1) counter

§9 requires "counter update is O(1) per write" and the T-005 acceptance criteria
add "no full scans". Reaching that needs the issue counts stored, because
`progress_cache` holds only a rounded percent and a percent cannot be incremented.

| Approach | Cost | Verdict |
|---|---|---|
| A. Extend `progress_points_cache` JSON to `{done, total, issuesDone, issuesTotal}` | One row amended in §2.4. No migration. Column is already TEXT holding JSON | **Chosen** |
| B. Add `progress_done_count` / `progress_total_count` INTEGER columns | Cleaner typing, but a migration that must serialize against the T-007 docs chain at the integration checkpoint | Rejected, cost outweighs the typing win |
| C. Keep the full aggregate, gate it to mutations touching `stateId`, `estimate`, `projectId`, `deletedAt` | Removes the title-edit amplification and the 200x bulk case. Still O(n) on writes that do matter | Rejected, does not meet §9 or the ticket's acceptance criteria |

A is chosen. C's gating is still worth doing and is folded into phase 5, because a
mutation that cannot move the number should do no work at all.

The full aggregate does not get deleted. It is renamed to a repair path, kept for
backfill and for a reconciliation entry point, and removed from the write path.

The backfill has no clean home. A one-shot entry point under `scripts/` is M0-owned
per §8 line 859 and would cost a second amendment. Phase 5 instead makes a stale
row self-heal on first touch and exports `repairAllProjects(wsId)` from the M4
service for deliberate reconciliation.

## Applicable skills

The implementer invokes, by name: `pstack:how` over the M1 issues services before
phase 3, since that subsystem is owned by another module and was written by a
different session. `pstack:architect` before phase 3, because the `IssueMutation`
contract crosses a function boundary and every later phase depends on its shape.
`pstack:interrogate` on the phase 5 diff before the PR, since the counter design is
the contested one. `/deslop` on every diff before commit. `pstack:tdd` for phases 1
and 4, which both have cheap local test targets.

## Phases

Ordered so the contract lands before its consumers. Phases 1, 2, and 8 are
independently shippable today and need no amendment.

1. [Authorization](phase-1-authorization.md)
2. [Workspace predicates in M4 services](phase-2-workspace-predicates.md)
3. [IssueMutation carries before-state](phase-3-event-contract.md)
4. [Arm the progress hook at the choke-point](phase-4-arm-the-hook.md)
5. [Delta counters](phase-5-delta-counters.md)
6. [Undo and restore emit faithful events](phase-6-undo-and-restore.md)
7. [Cross-workspace parenting validation](phase-7-parenting-validation.md)
8. [Cycle status derived on read](phase-8-cycle-status.md)
9. [Cycle scope and rollover through the choke-point](phase-9-cycle-choke-point.md)
10. [Consider-tier cleanup](phase-10-cleanup.md)
11. [Cache write atomic with the issue write](phase-11-atomic-cache-write.md)

Testing strategy across all phases: [testing.md](testing.md)

## Verification

Every phase runs all four gates from `AGENTS.md` and pastes counts into its commit
body. Beyond that, two runtime proofs gate the plan as a whole.

The ordering repro in `testing.md` is the acceptance test for phase 4. It must fail
against the current tree and pass after. A fix for a bug with no failing repro does
not ship.

A guest-role matrix test is the acceptance test for phase 1. §7 lines 840 to 842
are the source of truth for what it asserts.

## Implementation guidance

Read the T-005 work log before starting. It carries the evidence behind every
phase, including which reviewer found what.

Do not advance T-005 to `in-review` until phases 1 through 7 are green. Phases 8
through 11 may land after.

Every phase is one commit or a small ordered stack on the existing
`feat/t-005-projects-api` branch, PR into `dev` only, per `AGENTS.md`. Follow
`pstack:principle-sequence-verifiable-units`: build, verify, and commit each phase
before starting the next.

The two deviations currently living in code comments get filed in T-022 and the
comments get deleted. A comment is not an amendment.
