# T-035 : trashed pages and issues stay in the search index

status: done
module: M1 data & API core
owns: src/db/fts.sql, src/db/fts.ts, tests/db/fts.test.ts, tests/api/search.test.ts, src/lib/services/search.ts
depends-on: none
assignee: claude-code session 2026-08-19 (fix/t-035-fts-soft-deletes)

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-007, by probing the real `fts.sql` DDL rather than
reading it.

## What happens

`fts_pages_au` and `fts_issues_au` both list `deleted_at` in their `UPDATE OF`
column list, so a soft delete does fire them. Both then run the same body they
run for any other update: delete the index row, then unconditionally re-insert
it. Neither body tests `new.deleted_at`. The row lands back in the index.

`fts_projects_au` has the same shape and the same gap.

Observed against the committed DDL, minimum schema, in-memory database:

```
before delete      : [ 'page:p1', 'issue:i1' ]
after soft delete  : [ 'page:p1', 'issue:i1' ]
after block delete : []
```

The block trigger is correct: `fts_blocks_au` rebuilds the page body from
`WHERE deleted_at IS NULL`, so a deleted block's text does leave the index.
The bug is only at the entity level.

`reindexFts()` in `src/db/fts.ts` has the same gap in the other direction: its
three `INSERT … SELECT` statements carry no `deleted_at` predicate, so a
rebuild re-adds every trashed row. The comment above it says it mirrors the
trigger bodies, which is true, and that is the problem.

## Why it matters

§2.10 makes `search_fts` the one unified index behind FM-042, and ux-spec
§4.19 SR-03 groups its results across issues, pages and projects. A trashed
page stays findable, its row links to a 404 (or, once T-007's restore card
lands, to a trash notice), and the mono live counts in SR-01 count entities
the user deleted.

Pages have a 30-day trash window, so this is not a brief inconsistency. It is
a month of deleted content in every search.

## Interim state in T-007

T-007 cannot edit `src/db/**`; that is M1-owned under architecture §8 and is
outside its `owns:` list. So `src/lib/services/search.ts` joins every FTS hit
back to its live row and drops the ones that are trashed. That join is needed
anyway for the §7 permission filter, so it costs nothing extra today.

It does mean the index carries rows no query will ever return, and it means
any future consumer that reads `search_fts` directly inherits the bug. The
service-layer filter is a containment, not the fix.

## The fix

1. Guard the re-insert in `fts_pages_au`, `fts_issues_au` and
   `fts_projects_au` on `new.deleted_at IS NULL`. The leading `DELETE FROM
   search_fts` already runs unconditionally, so a soft delete becomes a clean
   removal and a restore re-adds the row.
2. Add `WHERE … deleted_at IS NULL` to all three `INSERT … SELECT` statements
   in `reindexFts()`.
3. Triggers are `CREATE TRIGGER IF NOT EXISTS`, and `applyFtsSchema` is
   idempotent by that guard, so changing a body does not take effect on an
   existing database. The change needs a `DROP TRIGGER IF EXISTS` ahead of
   each `CREATE`, or a versioned reapply. Decide which and write down why.

## Acceptance

- `tests/db/fts.test.ts` gains: soft-delete a page, an issue and a project;
  each disappears from `searchWorkspace`; restoring the page returns it.
- A test that runs `applyFtsSchema` twice against a database created by the
  previous DDL and asserts the new bodies are live, pinning step 3.
- Once this lands, `src/lib/services/search.ts` keeps its live-row join for
  the permission filter, but the T-007 test that pins "a trashed page is not a
  search hit" should be made to fail if the service-side filter is removed
  **and** to fail if the trigger regresses. Assert both layers separately.
- All four gates green.

## Work log

Session 2026-08-19, branch `fix/t-035-fts-soft-deletes`, cut from `dev` at
`4370959`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  314 files, 0 errors
PASS test   files: 64 passed (64) | tests: 422 passed (422)
PASS e2e    9 passed (10.1s)
ALL GATES PASS
```

Exit code 0, counts parsed. `dev` was 410 tests.

### owns amendment, recorded

Added `tests/api/search.test.ts` and `src/lib/services/search.ts`. The ticket's
own acceptance criteria demand the first (the T-007 tripwire asserts the bug
still exists, so the suite goes red the moment the fix lands) and the second
carries a header comment describing the bug as current state. The ticket body
and its `owns:` line disagreed; the body is the authority.

### Two holes this ticket did not name

The ticket named three `_au` triggers. Fixing only those leaves the entity
re-enterable through a child row, because the comment and block triggers
rebuild their PARENT with no liveness predicate:

- **Reachable through the API today.** `DELETE /api/issues/:id`, then
  `DELETE /api/comments/:commentId` on that issue, and the issue is back in the
  index. `deleteComment` checks the comment row and the author, and nothing
  re-checks the parent.
- The block path is defended only by `requireLivePage` in the blocks service,
  which is a different module from the trigger it protects.

Both are fixed. The invariant is now statable without a reachability argument:
`search_fts` holds a row for an issue, page or project exactly while its
`deleted_at IS NULL`.

### Step 3, and why DROP rather than a versioned reapply

`CREATE TRIGGER IF NOT EXISTS` is a NAME check. Observed against the committed
DDL: re-applying a file whose body had changed left the old body in place. So a
body edit alone would have shipped inert, reaching no existing database.

Every one of the 15 triggers now gets `DROP TRIGGER IF EXISTS` and drops its
`IF NOT EXISTS`. Chosen over a versioned reapply because the version machinery
needs a first user of the unused `_meta` table plus a constant a future author
has to remember to bump, which is the same class of mistake one layer up. An
unconditional DROP makes the file authoritative by construction.

`IF NOT EXISTS` comes off the CREATE deliberately: with a preceding DROP the
guard is dead, and leaving it preserves the exact shape that caused the bug.

### The part the ticket missed entirely: rows already written

Swapping trigger bodies does not clean the index. Observed: a page trashed
under the old triggers is still indexed after the new DDL is applied, `1` then
`1`. `applyFtsSchema` now prunes rows with no live entity behind them, which
takes it to `0`. Without that, every database in existence keeps its stale rows
forever, because nothing updates those rows again.

`scripts/migrate.mjs` execs the DDL directly rather than calling
`applyFtsSchema`, so `npm run db:migrate` alone does not prune.
`npm run seed` does, through `reindexFts`. That file is outside `owns:`; the
divergence is noted below rather than edited.

### Falsification

| Mutation | Failure |
|---|---|
| `fts_pages_au` drops its guard | `expected [ 'page:p1' ] to deeply equal []` |
| same, seen from the API tripwire | `expected 1 to be +0` |
| `fts_issues_au` drops its guard | `expected [ 'issue:…', …(1) ] to deeply equal [ 'project:pr1' ]` |
| comment trigger stops checking the parent | `expected [ 'issue:…' ] to deeply equal []` |
| block trigger stops checking the parent | `expected [ 'page:p1' ] to deeply equal []` |
| `reindexFts` re-adds trashed pages | `expected [ 'page:dead', 'page:live' ] to deeply equal [ 'page:live' ]` |
| the stale-row prune removed | `expected [ 'page:p1' ] to deeply equal []` |
| `DROP TRIGGER` removed | `expected 'CREATE TRIGGER fts_pages_au…' not to contain 'STALE BODY'` |

The last one is worth reading. The first version of that test applied the DDL
twice to a FRESH database and asserted the body was correct. It stayed green
with every DROP removed, because on a fresh database `IF NOT EXISTS` and
`DROP`+`CREATE` are indistinguishable. It now installs a stand-in for an older
body first, which is the only situation where the DROP does anything.

### The two-layer question

The service-side filter in `src/lib/services/search.ts` stays. It is not
redundant: the liveness predicate rides in the same `and(...)` as the section 7
permission filter, which the index structurally cannot express, so removing it
would mean rewriting three where-clauses to drop one condition each.

The T-007 tripwire that asserted the bug now asserts the invariant, and the two
layers are asserted separately, so neither masks the other. Removing the
service filter fails the API assertion; removing the trigger guard fails the
index assertion.

### Not done

`scripts/migrate.mjs` reimplements what `fts.ts` exports, which is how the two
drifted. It should import `applyFtsSchema` so a migrate also prunes. That file
is M0-owned and outside this ticket; worth a one-line ticket. Until then, the
documented recovery for an existing `data/prodmax.db` is `npm run seed`.
