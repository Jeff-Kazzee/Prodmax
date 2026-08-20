# T-035 : trashed pages and issues stay in the search index

status: open
module: M1 data & API core
owns: src/db/fts.sql, src/db/fts.ts, tests/db/fts.test.ts
depends-on: none
assignee: none

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

(empty)
