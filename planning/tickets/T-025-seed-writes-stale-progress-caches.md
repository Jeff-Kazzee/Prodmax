# T-025 — the seed hand-writes project progress caches, in the legacy shape

status: open
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
