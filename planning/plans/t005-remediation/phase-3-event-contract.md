# Phase 3: the issue-write contract

Back to [overview.md](overview.md).

## Goal

One value describes an issue write, and one function performs it. The mutation
event becomes `IssueTransition`, carrying the full `IssueRow` on both sides.
`runIssueWrite` opens the transaction, hands the body a branded `IssueWriter`,
and flushes the buffered transitions once at the outermost call. A write that is
not recorded stops being expressible, because the write and the record are one
call. This is the foundational phase. Phases 4, 5, 6, 9, and 11 all consume the
construct it defines.

The authority for this phase is [design-decision.md](design-decision.md). Where
an earlier draft of this file disagreed with it, the decision wins.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. This phase edits
`src/lib/services/issues-events.ts`, `issues.ts`, `issues-update.ts`,
`issues-bulk.ts`, and `issues-history.ts`, all M1-owned under §8 line 860 and
all five named in the amendment.

Before writing it, the implementer runs `pstack:how` over the M1 issue services
and `pstack:architect` on the contract itself. Five later phases depend on this
shape, so it is settled before any of it is typed.

## Changes

**`src/lib/services/issues-events.ts`.** The file stops being a listener array
and becomes the choke-point. It holds the transition type, the writer, the
consumer table phase 4 defines, and the two derived functions.

`IssueMutation` and `IssueMutationKind` are deleted. `IssueTransition` replaces
them, carrying `before`, `after`, `workspaceId`, `actorId`, and `cause`. Both
sides are the whole `IssueRow`. Every emit site already holds both rows, so the
full row costs nothing to carry, and a curated subset is a second schema that
gets relitigated the first time a consumer needs a field outside it. T-016 needs
`version` and `identifier`, phase 9 needs `cycleId`, and `moveIssueTeam` needs
`teamId`.

The state category is not on the transition. Resolving it at every write would
tax every write with a `states` read to serve a consumer that skips most of them.
The consumer resolves it and memoizes, and `w.noteState` pre-warms the memo from
a state row the writer already loaded.

`kind` is deleted. `before === null` is the union discriminant and means a
create. Everything else is a fact about the pair, and a field that restates the
pair can disagree with it. In this tree it already does. `applyUndo` reports
`updated` for restores that un-delete rows, and `bulkUpdateIssues` reports
`updated` for batches that may be entirely deletes.

`sseEventName` and `changedFields` replace it as pure functions of the pair.
`sseEventName` returns the four §5 wire names, so they cannot drift from the
rows. `changedFields` returns the §4.1 `patch`. Writer intent that the rows
genuinely cannot show moves to `cause`, a closed union replacing the untyped
`patch` markers that carry `undo` and `bulk` today.

**`runIssueWrite`, in the same file.** It takes `wsId`, `actorId`, and a body. It
opens or joins the transaction, hands the body an `IssueWriter`, buffers every
transition the body records, and flushes the buffer to the consumers once, still
inside the transaction, at the outermost call. Nesting is already free. The
better-sqlite3 session in Drizzle promotes a nested `transaction()` to a
savepoint, every service on this path is synchronous, and `bulkUpdateIssues`
nests today.

The batch window is what makes phase 5 cheap. A 200-issue bulk into one project
becomes one `UPDATE projects` rather than 200. A 1,000-issue cycle scope call
becomes zero queries and zero writes, because `cycleId` is not a counted field
and the phase 5 gate rejects all 1,000 before any work starts.

An optional fourth argument names the `cause`. A nested run inherits the
outermost cause unless it names its own, so `bulkUpdateIssues` marks its whole
batch without editing `updateIssue`.

The writer lives here rather than in a new service file because the T-022
carve-out names five files, not a directory. A sixth file under
`src/lib/services/**` would need a second amendment.

**The writer's four methods.** `w.write(before, patch)` runs the UPDATE and
records the transition. There is no second step to forget. `w.writeMany(befores,
patch)` does the same for a set, as one `UPDATE ... WHERE id IN (...)`, one
batched re-read, and one faithful transition per issue. Phase 9 is its caller.
`w.insert(values)` covers creates and records a transition whose `before` is
null. `w.noteState(state)` pre-warms the category memo and records nothing.

The brand on `IssueWriter` is a `unique symbol` that is not exported, and
`runIssueWrite` is its only producer. A caller cannot construct a writer, so a
recorded write outside a transaction is not expressible.

**Every call site moves onto the writer.** `createIssue` in `issues.ts` uses
`w.insert`. `trashIssue` uses `w.write` with the row `requireLiveIssue` already
loaded. `updateIssue` and `moveIssueTeam` in `issues-update.ts` use `w.write`
with the row loaded at the top of the function, and `updateIssue` passes the
state it already resolved through `requireStateOnTeam` to `w.noteState`.
`restoreDescriptionVersion` in `issues-history.ts` moves too, taking the
workspace id off the row it already holds, so its M3-owned caller under
`src/pages/api/issues/[id]/description-versions.ts` is untouched.
`restoreSnapshot` and `applyUndo` in `issues-bulk.ts`, and `restoreIssue` in
`issues-update.ts`, are phase 6. `updateCycleScope` and `closeCycle` in
`cycles.ts` are phase 9.

**`src/lib/services/projects-progress.ts`.** `previousProjectId` is deleted
outright, together with the `issueHistory` import it needs. The previous project
is `before.projectId`. That removes the `issue_history` read-back and with it the
3-minute grace-window hole, because `recordFieldChange` returns early inside the
create grace window and the read-back therefore finds nothing for a
create-then-reproject. The known gap paragraph at lines 67 to 75 is deleted in
the same commit, per T-022 deliverable 6. A comment is not an amendment.

The test that backdates `created_at` to step around the grace window loses its
reason to exist and drops the backdating.

## Data structures

```ts
type IssueWriteCause = "direct" | "bulk" | "undo" | "cycle";

interface IssueTransition {
  before: IssueRow | null; // null means created, and is the discriminant
  after: IssueRow;
  workspaceId: string;
  actorId: string;
  cause: IssueWriteCause;
}

declare const writerBrand: unique symbol; // not exported

interface IssueWriter {
  readonly [writerBrand]: true;
  write(before: IssueRow, patch: IssuePatch): IssueRow;
  writeMany(befores: IssueRow[], patch: IssuePatch): IssueRow[];
  insert(values: IssueInsert): IssueRow;
  noteState(state: StateRow): void;
}

function runIssueWrite<T>(
  wsId: string,
  actorId: string,
  body: (w: IssueWriter) => T,
  cause?: IssueWriteCause,
): T;

function sseEventName(t: IssueTransition): SseIssueEventName;
function changedFields(t: IssueTransition): Partial<IssueRow>;
```

`sseEventName` reads the pair. A null `before` gives `issue.created`. A `teamId`
that differs gives `issue.moved`. A `deletedAt` that goes from null to set gives
`issue.deleted`. Everything else is `issue.updated`. Those `teamId` and
`deletedAt` reads are why the full row is carried rather than a four-field
subset.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

`astro check` is a real gate here rather than a formality. Deleting `kind`
breaks every call site that set it, so the type checker enumerates the work.

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

Until phase 4 lands, this repro only holds in a process that has already served a
projects route. Run it after step 2 has issued a `GET /api/projects` so the old
registration is armed, and keep the two bugs separate.
