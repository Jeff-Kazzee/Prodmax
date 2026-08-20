# T-025 — the seed hand-writes project progress caches, in the legacy shape

status: done
module: M0 scaffold, M4 projects
owns: scripts/seed.ts, tests/api/projects-progress*.test.ts
depends-on: T-005 (done)

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found by a cross-model review of the T-023 diff, then verified against the tree.
Outside T-023's `owns:` list, so it needs this ticket.

## What is wrong

`scripts/seed.ts:240` and `:260` insert 24 issues through a raw helper and then
hard-code both projects' caches:

```
progress_cache: 14,
progress_points_cache: JSON.stringify({ done: 2, total: 14 }),
```

Two defects in three lines.

**The shape is legacy.** §2.4 and `ProgressPoints` want four fields
(`done`, `total`, `issuesDone`, `issuesTotal`). These rows carry two.
`parseProgressPoints` returns null for them, which is the deliberate degraded
path: the next write on that project repairs instead of incrementing. So the
seeded bench is born in the state the property test has to simulate on purpose
via its `legacyCache` action.

**The numbers are not derived.** They are typed in beside the issue inserts. A
review run reported both projects disagreeing with what `repairProjectProgress`
computes for the same rows, one of them by more than a rounding step. Until
something writes an issue on that project, `GET /api/projects` serves the
hard-coded percent. This is the demo bench `npm run e2e` drives and the one a
human sees first.

`src/lib/services/project-updates.ts:50` makes one instance permanent:
`progressSnapshot` defaults to `project.progressCache`, so a `project_updates`
row created against a stale cache freezes the wrong number forever.

## Related: the reconciliation backstop has no callers

`repairAllProjects` (`src/lib/services/projects-progress.ts:139`) is exported,
documented as the reconciliation entry point, and invoked nowhere in `src/`,
`tests/`, or `scripts/`. Nothing in the product can repair a drifted workspace,
which is why the defect above has no safety net.

## Deliverables

1. Delete both hard-coded cache pairs. Call `repairAllProjects(wsId)` at the end
   of `seedDemo`, after the issues are inserted, so the bench is derived from the
   rows it ships with.
2. A test that seeds and asserts every project's stored cache equals what
   `repairProjectProgress` computes. It must fail against the current tree.
3. Decide whether `repairAllProjects` gets a caller (an admin reconcile route)
   or gets deleted. Record the answer in architecture §9. An unused backstop that
   nothing can invoke is not a backstop.

## Acceptance

The seed test fails before and passes after. All four gates green.

## Work log

Session `6858dcdc`, 2026-08-19. Branch `fix/t-025-seed-progress-caches`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  279 files, 0 errors
PASS test   files: 54 passed (54) | tests: 283 passed (283)
PASS e2e    9 passed (9.5s)
ALL GATES PASS
```

### The drift was real

Payments Reliability hard-coded 14% and computes to 14%. Onboarding Revamp
hard-coded 29% and computes to 14%, over 1 of 7 counted issues. Both cache
pairs were the legacy two-field shape, so `parseProgressPoints` rejected them
and every seeded project opened in the degraded state the S-15 UI renders as
"counts unavailable".

### Deliverable 1, with a deviation

The caches are derived, but by raw SQL in the seed rather than by calling
`repairAllProjects` as the ticket proposed. Node runs `scripts/seed.ts`
directly and cannot resolve the `@/` alias that the services layer imports
through, so importing it fails at runtime with ERR_MODULE_NOT_FOUND. Tried
first, rejected on evidence.

The duplication that creates is closed from the other side:
`tests/api/projects-progress-seed.test.ts` runs the real
`repairProjectProgress` over a freshly seeded database and requires it to
produce exactly what the seed wrote, so the two implementations are pinned to
each other rather than merely both existing.

### Also fixed, same class

The closed cycle's `stats_snapshot` was `{completed, carried, points}`, which
`parseStats` rejects into zeros. So the seeded closed cycle rendered as one
that did nothing, under an "as of close" caption asserting those zeros, with
its real issues listed underneath. It now carries the
`{scope:{issues,points}, completed:{issues,points}}` shape, derived the same
way. Found by a reviewer during T-006 and in this ticket's owns list.

### Deliverable 3, the decision

`repairAllProjects` stays. An operator-facing reconcile belongs to M10 admin
(T-019), and inventing an endpoint for it now would put a full table scan
behind a route with no permission story. Until then it is exercised by the
sweep test, which perturbs every seeded project and requires it to restore
exactly what the seed derived. Recorded in architecture §9, along with the
instruction to delete it if T-019 ships without a reconcile.

### Falsification

| Break | Failure |
|---|---|
| Restore the shipped seed: hand-written legacy caches, derived block removed | 4 of 5 fail, first as `Payments Reliability cache: {"done":2,"total":14}: expected null not to be null` |

Both pinning tests perturb before they compare. Running an idempotent repair
over a correct row and asserting it is unchanged proves nothing, because the
repair rewrites the same numbers over a wrong row too.

### Constraint amendment

`planning/architecture.md` §9 is outside the `owns:` list. Deliverable 3 asks
for the decision to be recorded there.

