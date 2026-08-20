# T-007 — M5a Docs API (pages/blocks/templates/search)

status: in-review
module: M5 docs engine
assignee: claude-code session 2026-08-19 (feat/t-007-docs-api)
owns: src/pages/api/pages/**, src/pages/api/blocks/**, src/pages/api/templates/**, src/pages/api/search/**, src/lib/services/{pages,blocks,templates,search}*, src/lib/validation/{pages,blocks}*, tests/api/{pages,blocks,search}*
depends-on: —

> Read `planning/tickets/README.md` first. Schema exists (pages, blocks,
  templates in src/db/schema.ts; FTS5 infra in src/db/fts.ts + fts.sql —
  pages/projects triggers already synced; verify block text updates
  propagate to the pages row FTS).

## docs-to-read
- architecture.md §2.6 (pages & blocks — 19 block types + per-type
  contracts), §2.7 (templates), §2.10 (positions/path), §3.6 (endpoints),
  §9 (the one-query page open counter-design)
- ux-spec.md §4.17–§4.18 + §5 (consumers)

## Deliverables

All 10 endpoints from §3.6:

- Page tree: GET `/api/workspaces/:wsId/pages/tree` (visible nodes only,
  materialized path, O(expanded)); page CRUD + restore (trash 30-day);
  move = path rewrite + depth cap 20 + cycle detect.
- Blocks: GET `/api/pages/:pageId/blocks` = ONE ordered query
  (page_id, deleted_at IS NULL, ORDER BY parent_id, position) — client
  builds the tree, no recursion (§9); POST create; PATCH single (props,
  position, parent — nest rules per type); DELETE soft; POST
  `/api/pages/:pageId/blocks/batch` (paste/drag-multi, one transaction);
  every write updates the page's extracted FTS text.
- richText sanitize: allowed marks only; link schemes http/https/mailto;
  mention nodes validated against workspace members.
- Templates: CRUD + `POST /api/templates/:id/instantiate` (issue kind →
  prefilled issue payload; page kind → blocks tree clone).
- GET `/api/search` over src/db/fts.ts (entityTypes filter, cursor-safe).

## Acceptance
Vitest: tree query shape (single SELECT — assert via prepared-statement
counter), block CRUD + batch atomicity + nest-rule enforcement, sanitize
cases (bad scheme, unknown mark, non-member mention), path rewrite +
depth/cycle rejects, trash/restore, template instantiate, search ranking
sanity (title boost). All four gates green.

## Work log

Session 2026-08-19, branch `feat/t-007-docs-api`, cut from `dev` at `0da5180`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  312 files, 0 errors
PASS test   files: 62 passed (62) | tests: 357 passed (357)
PASS e2e    9 passed (42.3s)
ALL GATES PASS
```

Exit code 0, counts parsed. Baseline on `dev` was 56 files / 292 tests, so this
adds 6 files and 65 tests. Reseeded with `npm run db:migrate && npm run seed`
before the run.

### Files

Services `pages-access`, `pages`, `pages-trash`, `blocks-write`, `blocks`,
`templates`, `search`. Validation `pages`, `pages-templates`, `blocks`,
`blocks-richtext`, `blocks-ops`. Eleven route files. Six test files plus
`tests/api/pages-harness.ts`.

### The shape, and why

Three invariants are carried by branded types rather than by guards a route
could forget to call. `requireDocs` is the only constructor of `DocsCtx` and it
403s guests per §7; `sanitizeBlock` is the only constructor of `SanitizedBlock`
and derives the `text` column from the props it just cleaned; `resolvePlacement`
is the only constructor of `Placement` and enforces §2.6's children-allowed
column. A service that skips any of the three does not typecheck.

The four block write endpoints are each a batch of one, so nest rules,
sanitization, position allocation and the page version bump have one
implementation in `blocks-write.ts`.

Subtree operations use the half-open path range `[path + '/', path + '0')`
rather than `LIKE path || '/%'`. Measured on this engine: LIKE plans as `SCAN`
and matches case-insensitively, so it both misses the BINARY-collated
`pages_ws_path_idx` and would match sibling paths differing only in case. The
range plans as `SEARCH t USING COVERING INDEX`.

Trash cohorts ride `deleted_at`, allocated strictly above any stamp already in
the workspace, so restore matches its own cohort by equality and a child
trashed earlier keeps a smaller stamp and stays trashed. No migration, so
nothing serializes behind `0002_parallel_warhawk.sql`.

Search treats the FTS index as a candidate generator and re-resolves every hit
against its base table. That pass is needed anyway for the §7 guest team rule,
which the index cannot express (it has no `team_id`), and it is where
soft-deleted rows are dropped.

### Decisions that diverge from a spec line

**Tree endpoint path.** §3.6 and this ticket both write
`GET /api/workspaces/:wsId/pages/tree`. That file is
`src/pages/api/workspaces/[id]/pages/tree.ts`, which §8 assigns to M1 and this
ticket's `owns:` does not cover, and §8's overlap rule says a module never edits
another's files. It is also the only path-embedded wsId in the whole API
surface. Shipped as `GET /api/pages/tree?wsId=`, matching every other endpoint.
The acceptance criteria constrain the tree query shape, not the URL, so this
satisfies acceptance. **§3.6 needs a wording amendment.**

**Template instantiate.** §3.6's table says "issue to new issue"; the
deliverable says "prefilled issue payload". Followed the deliverable.
`tests/api/projects-choke-point.test.ts` asserts the set of files writing
`issues` is exactly one with a total of zero violations, so creating an issue
here would turn an existing gate red, and the legitimate route is `runIssueWrite`
in M1/M3 files outside `owns:`. §9 also states that an issue created outside
that choke point never drives the progress-delta consumer and nothing
self-heals. **§3.6 needs a wording amendment.**

**Sanitize rather than reject.** The acceptance names "bad scheme, unknown
mark, non-member mention" as *sanitize cases*, so each is cleaned and the
surrounding text survives. Structural errors (unknown block type, wrong props
shape) still 400.

**`?types=comment`** is rejected with VALIDATION. §3.6's search row lists it,
but §2.10's content policy folds comment bodies into their issue's body rather
than indexing comments as entities, so nothing could be returned.

### Falsification

Every guard was broken and the specific failure recorded. Each mutation
asserted its anchor string was present first, so a no-op edit could not
masquerade as proof, and each was applied in binary mode with
`git diff --stat` checked so line endings survived.

| Mutation | Failure |
|---|---|
| N+1 added to `listPageBlocks` | `expected [ …(61) ] to have a length of 1 but got 61` |
| `.orderBy` replaced with a JS sort | `expected 'select "id", "workspace_id", "page_id…' to match /order by/i` |
| `quote` added to the child-bearing set | `expected 201 to be 400` |
| batch transaction wrapper removed | `expected [ { …(12) }, …(2) ] to have a length of 1 but got 3` |
| replayed insert 409s instead of converging | `expected 500 to be 200` |
| subtree rewrite scoped to `parent_id` | `expected '/01a01cf8-579d…' to be '/01a01cf8-57a8…'` |
| depth cap reads the moved node only | `expected 200 to be 400` |
| cycle detection dropped | `expected 200 to be 409` |
| restore widened to any trashed descendant | `expected null to be 1787192444077` |
| trash stamp taken from the clock | `expected 1787192537024 to be 1787192537025` |
| guest branch removed from `requireDocs` | `GET /pages should be 403 for a guest: expected 200 to be 403` |
| search drops the live-row filter | `expected [ { entityType: 'page', …(6) } ] to have a length of +0 but got 1` |
| search stops narrowing types for guests | `expected [ …(2) ] to deeply equal [ Array(1) ]` |
| mark allowlist removed | `expected { text: [ …(4) ] } to deeply equal { text: [ …(4) ] }` |
| link scheme check removed | same, across all five write paths |
| non-member mentions trusted | same, across all five write paths |
| a second module writes `blocks` | `expected { 'src/lib/services/pages.ts': 1 } to deeply equal {}` |
| `page_link` renamed in BLOCK_SPECS | `- "page_links" / + "page_link"` |

**One test was found vacuous and fixed.** "gives two deletes in the same
millisecond different stamps" never froze the clock, so `Date.now()` separated
the two deletes on its own and the assertion held against an allocator that did
nothing. Mutating `allocateTrashStamp` to plain `Date.now()` left it green.
It now freezes the clock with `vi.spyOn(Date, "now")` and asserts the exact
pair `frozen` and `frozen + 1`.

**Search fixtures carry 20 filler documents,** because the bm25 title weight is
not measurable below that. Measured on this engine, the title-versus-body score
gap is 0.000001 at 3 documents, 0.155659 at 6, 1.207501 at 20 and 2.643132 at
100. A ranking assertion over a small corpus therefore passes on floating-point
noise. These assert ordering, which does move.

Both the docs suites and the island suites were run shuffled
(`--sequence.shuffle.tests --sequence.seed=2`): 64/64 and 79/79, no order
dependence.

### A claim checked and found wrong

A reviewer reported that the existing ranking assertion in `tests/db/fts.test.ts`
is near-vacuous. Checked by mutating `bm25(search_fts, 10.0, 1.0)` to
`bm25(search_fts, 1.0, 1.0)` and running the real test: it fails at line 34,
because the *ordering* assertion catches the change. Only line 36's
`score[0] > score[1]` is decorative, riding an 8.9e-7 gap. The guard holds, so
no ticket was filed.

### Defects found outside `owns:`, filed not fixed

- **T-034**, seeded blocks do not match the §2.6 props contract on four of five
  types, and `issue_view` points at an issue rather than a saved view.
- **T-035**, `fts_pages_au`, `fts_issues_au` and `fts_projects_au` fire on
  `deleted_at` but re-INSERT unconditionally, so trashed entities stay in the
  index. Observed against the committed DDL. Contained by the search service's
  visibility pass; `tests/api/search.test.ts` carries a tripwire asserting the
  current trigger behaviour so the containment can be removed when it lands.
- **T-036**, `POST /api/teams` returns 201 but seeds no workflow states, so an
  issue cannot be filed in any team created through the API.

### Not done, and left unverified

- No migration was added, so nothing serializes behind `0002`.
- No island or e2e coverage: T-007 is API only and its `owns:` list carries no
  UI or e2e paths. The docs UI arrives with T-008 through T-010.
- Trash is a read-time 30-day window with no purge. §9 is explicit that a
  backstop nothing can invoke is decoration; an operator purge belongs to T-019.
- `CANDIDATE_WINDOW` in the search service is 500 and unmeasured. A query whose
  visible results exceed it truncates. The AT-062 100k-document corpus does not
  exist yet, so the right value is unknown.
- Page favorites (DH-03) are unreachable: `favorites` carries
  `check(entity_type IN ('project'))`. That is T-008's migration, not a silent
  gap here.
- Block-level comments, backlinks and page history (PE-03) are not in §3.6's
  ten endpoints and are not built.

---

## Work log, round 2: the review, and what it found

Four independent reviewers ran against the frozen commit `d0a16fa`, one per
lens: state transitions, security and permissions, vacuous assertions, and spec
conformance. They found **ten defects and three unfalsifiable guards** in a tree
whose four gates were green. Everything below was reproduced before it was
fixed, and every fix was then falsified.

Final gate run:

```
════ GATE VERDICT ════
PASS build  complete
PASS check  314 files, 0 errors
PASS test   files: 64 passed (64) | tests: 406 passed (406)
PASS e2e    9 passed (13.2s)
ALL GATES PASS
```

Exit code 0, counts parsed. Round 1 was 62 files / 357 tests, so the review
round added 2 files and 49 tests. Docs suites shuffled at seed 2: 114/114.

### The correction that matters most

Round 1's ledger claimed the §9 one-query invariant was pinned. **It was not.**
`recordStatements` counted `prepare` calls. A better-sqlite3 `Statement` is
reusable, so the N+1 that a real performance regression produces, one prepare
hoisted outside the loop and one execution per row, called `prepare` exactly
once and was invisible. A reviewer replaced the single ordered SELECT with a
recursive child walk doing **61 executions** over `blocks` and every assertion
stayed green, including the "same cost at 3 blocks as at 60" one.

The mutation in round 1's ledger (`N+1 added to listPageBlocks`) happened to
use the one shape that re-prepares per row, which is the shape a regression is
least likely to take. Reading the ledger, that entry looked like proof. It was
a coincidence.

`recordStatements` now wraps the returned `Statement` and records on `all`,
`get`, `run` and `iterate`, so it counts executions. Re-run against the same
hoisted-prepare walk it reports
`expected [ …(61) ] to have a length of 1 but got 61`. The implementation was
right the whole time; only the proof was hollow.

### Defects fixed (all reproduced first)

| Severity | Defect |
|---|---|
| Critical | A block could be moved under its own descendant. `resolvePlacement` checked self-parenting only, never ancestry. The ring was invisible to any client tree and undeletable: `softDeleteBlockRows` walked it with no visited set, growing its queue until `RangeError: Invalid array length` after about 7.5s of one core. |
| High | Re-inserting a soft-deleted block id hit the primary key and 500ed. ED-11 undo-of-delete has no other path back, and §3.6 has no block restore endpoint. |
| High | `patchPage` wrote metadata outside any transaction, then delegated the move, so a rename plus a rejected move committed the rename and returned an error. |
| High | Turn-into could convert a parent into a leaf type while it still had children, reaching from the other side the exact state the `Placement` brand claims is unreachable. |
| Medium | The batch replay branch left the in-memory view's type stale, so a later op validated against a type the row no longer had. |
| Medium | `patchPage` bumped `version` twice for one request. |
| Medium | `table` props capped only the outer `rows` array. One block accepted 200,000 richText nodes and held the single SQLite writer for 1.6s, stalling every other workspace on the process. |
| Low | A too-deep page template threw a plain `Error`, so it became `INTERNAL` 500. §3 says VALIDATION is 400 on every route. |
| Binding | No endpoint read `?expectedVersion=`, though `pages` and `blocks` are both versioned. §3: "All mutating endpoints accept `?expectedVersion=` where the entity is versioned; mismatch to 409 CONFLICT". This was not even in round 1's "Not done" list. |
| Binding | `GET /api/pages` and `GET /api/templates` ignored `?limit=` and `?cursor=`. |

Also closed: dangling `issue_view.viewId` and `page_link.pageId` are now
rejected at write time rather than stored; templates round-trip the
`recurrence` column §2.7 gives them; a team-scoped template must name a team of
its own workspace; the trash window is one predicate rather than two that
disagreed by a millisecond; `image.url` accepts a root-relative path and is
optional so ED-08's upload placeholder can exist; the tree's `hasChildren`
query is scoped to the visible ids rather than scanning every live page; and
`cloneNodes` reads the page once instead of once per cloned node.

### Guards that could not fail, and are repaired

1. **The statement counter.** Above.
2. **The choke-point detector.** `rawWrites` matched 5 of 16 write shapes. A
   reviewer added a real, effective block write to `pages.ts` using drizzle's
   own table interpolation and all five gate tests stayed green while the write
   landed. `WRITE_SHAPES` now pins the detector itself against every shape,
   including quoted, namespaced, schema-qualified, interpolated,
   `INSERT OR REPLACE`, `REPLACE INTO` and `UPDATE OR IGNORE`.
3. **The EXPLAIN assertion.** It checked that the index name appears in the
   plan, which stays true when the ORDER BY moves to a sort buffer: the index
   still serves the `page_id` lookup. Paired now with
   `not.toContain("USE TEMP B-TREE FOR ORDER BY")`.

Four more were weak rather than empty and were strengthened: the nest matrix
covered 12 of 19 block types (flipping `heading_2` to child-bearing was
invisible) and now covers all 19 against a hand-transcribed §2.6 table; the
batch cap was tested only from above, so `>` to `>=` went unseen; the
fixed-point move test passed with `movePage` disabled entirely and now proves
the move happened first and includes `position` and `version`; the template
clone asserted five primary keys are distinct, which is a tautology, and now
compares two instantiations of the same template.

### One fix that turned out to be no fix

I added a transaction wrapper to `patchPage` and claimed it fixed the
half-applied PATCH. Falsification says otherwise: removing the wrapper breaks
no test, because folding the metadata into `movePage`'s own UPDATE already
leaves exactly one write on either branch. Mutating the fold away does fail
three assertions. The wrapper was deleted rather than kept as decoration, and
the claim was corrected instead of left standing.

### Falsification, round 2

Seventeen mutations, all red with the expected message. Every one asserted its
anchor was present first and was applied in binary mode with `git diff --stat`
checked.

| Mutation | Failure |
|---|---|
| hoisted-prepare N+1 in the page open | `expected [ …(61) ] to have a length of 1 but got 61` |
| block cycle check removed | `expected 200 to be 409` |
| delete visited set removed | `expected 500 to be 200` |
| soft-deleted revive branch removed | `expected 500 to be 200` |
| turn-into children guard removed | `expected 200 to be 400` |
| replay branch stops syncing view type | `expected 200 to be 400` |
| table inner cell cap removed | `expected 201 to be 400` |
| block expectedVersion ignored | `expected 200 to be 409` |
| page expectedVersion ignored | `expected 200 to be 409` |
| page_link referential check removed | `expected 201 to be 400` |
| metadata fold reverted to two writes | `expected 'RENAMED' to be 'Parent'`, and `expected 3 to be 2` |
| trash window predicate split again | `expected true to be false` |
| pages list stops paginating | `expected [ …(6) ] to have a length of 2 but got 6` |
| template recurrence dropped on write | `expected null to deeply equal { freq: 'weekly', every: 1 }` |
| template depth throws a plain Error | `expected 500 to be 400` |
| template teamId check removed | `expected 201 to be 400` |
| tree hasChildren unscoped | `page query not scoped by parent: select distinct "parent_id" from "pages" where …` |
| `page_link` renamed in BLOCK_SPECS | `- "page_links" / + "page_link"` |

The tree entry took two attempts and is worth recording. The first version
asserted the statement text matches `/parent_id/i`, which passed against the
unscoped query because `SELECT DISTINCT parent_id` carries the column name in
its projection. It now reads the WHERE clause only.

### A reviewer claim that was wrong

One reviewer reported `tests/db/fts.test.ts`'s ranking assertion as
near-vacuous. Checked by mutating `bm25(search_fts, 10.0, 1.0)` to
`bm25(search_fts, 1.0, 1.0)` and running the real test: it fails at line 34,
because the ordering assertion catches it. Only line 36's
`score[0] > score[1]` is decorative, riding an 8.9e-7 gap. No ticket filed.
Verifying stopped a wrong one being written.

### Process note

Twice I reverted a mutation with `git checkout -- <file>` on a file that also
held uncommitted fixes, and lost them. The second time cost four fixes in
`pages.ts`. Falsification and uncommitted work do not mix: commit first, then
mutate.

### Tickets filed from this round

- **T-037**, the three spec amendments this implementation owes (tree URL,
  instantiate payload, camelCase template data).
- **T-038**, bookmark/embed have no server unfurl and search returns no
  snippet or block anchor. Both are ux-spec requirements outside §3.6's ten
  endpoints. The unfurl half needs an SSRF design before any code.

### Still not done, and still unverified

Everything in round 1's list stands, minus the items fixed above, plus:

- `CANDIDATE_WINDOW` is still 500 and still unmeasured.
- No test asserts a statement count on the template instantiate path, so the
  `cloneNodes` improvement is a reasoned change rather than a pinned one.
- The block `text` column is derived for FTS, but nothing asserts the page's
  FTS body after a block soft-delete followed by a revive.
