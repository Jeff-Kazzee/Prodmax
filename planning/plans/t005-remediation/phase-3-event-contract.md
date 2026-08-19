# Phase 3: IssueMutation carries before-state

Back to [overview.md](overview.md).

## Goal

`IssueMutation` gains a `before` field holding the issue's pre-write state, so a
consumer can compute a delta without querying anything and without reading the
old project id back out of `issue_history`. This is the foundational phase.
Phases 4, 5, 6, and 9 all consume the shape it defines.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. This phase edits
`src/lib/services/issues-events.ts`, `issues.ts`, and `issues-update.ts`, all
M1-owned under §8 line 860.

Before writing it, the implementer runs `pstack:how` over the M1 issue services
and `pstack:architect` on the contract itself. The `before` shape crosses a
function boundary that four later phases depend on, so its shape is settled
before any of it is typed.

## Changes

**`src/lib/services/issues-events.ts`.** `IssueMutation` today carries
`{kind, workspaceId, issueId, actorId, patch?}`. It gains `before`, holding the
pre-write `stateId`, the pre-write state's category, `estimate`, and `projectId`.
Those four fields are exactly what a progress consumer needs to decide whether an
issue joined a project, left one, became complete, or stopped being complete, and
by how many points. `before` is absent on `kind: "created"` and present on
`updated`, `deleted`, and `moved`. The field is additive, so existing consumers
compile unchanged.

**Population, at every write site.** Each site already holds the pre-write row,
so nothing extra is read except the old state's category.

- `issues.ts`, `createIssue`. Emits `created` with no `before`.
- `issues.ts`, `trashIssue`. The row loaded by `requireLiveIssue` before the soft
  delete supplies `before`.
- `issues-update.ts`, `updateIssue`. The `issue` row loaded at the top of the
  function supplies `before`. The function already resolves the new state through
  `requireStateOnTeam`. The old state's category costs one indexed read of
  `states` by primary key.
- `issues-update.ts`, `moveIssueTeam`. Same source row. A team move does not
  change project membership, but the event still carries the field so consumers
  never branch on kind to know whether `before` is trustworthy.
- `issues-bulk.ts`, `bulkUpdateIssues` and `applyUndo`. Populated here for
  completeness. Phase 6 replaces both of these emissions with faithful per-issue
  events, and depends on this field existing.

**`src/lib/services/projects-progress.ts`.** `previousProjectId` is deleted
outright, together with the `issueHistory` import it needs. `affectedProjectIds`
reads the previous project from `event.before` instead. That removes the
`issue_history` read-back and with it the 3-minute grace-window hole, because
`recordFieldChange` folds field changes made inside the create grace window and
the read-back therefore returns nothing for a create-then-reproject. The known
gap paragraph at lines 67 to 75 is deleted in the same commit, per T-022
deliverable 6. A comment is not an amendment.

The test that backdates `created_at` to step around the grace window loses its
reason to exist and drops the backdating.

## Data structures

- `IssueBeforeState`, new. `{stateId, stateCategory, estimate, projectId}`,
  captured before the write.
- `IssueMutation.before`, new. Optional `IssueBeforeState`. Absent only on
  `created`.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

**Runtime.** The create-then-reproject case is the observable. It fails today and
passes after.

1. `npm run db:migrate && npm run seed`, `npm run build`,
   `npm run preview -- --port 4321`.
2. Create projects A and B over HTTP. Create an issue in project A and complete
   it, so A's `progress_cache` reads 100.
3. Within three minutes of the create, `PATCH /api/issues/:id` moving the issue
   to project B.
4. Read both rows straight out of `data/prodmax.db` with sqlite rather than
   through the projects API. Observed end state after this phase: A's
   `progress_cache` is 0 and B's is 100. Before this phase A stays at 100,
   because the read-back found no history row inside the grace window.

Note that until phase 4 lands, this repro only holds in a process that has
already served a projects route. Run it after step 2 has issued a
`GET /api/projects` so the hook is armed, and keep the two bugs separate.
