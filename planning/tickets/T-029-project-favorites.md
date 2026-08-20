# T-029 : PJ-01's star has nothing to write to

status: done
module: M4 projects & cycles
owns: src/db/schema.ts, src/pages/api/projects/[id]/favorite.ts, src/lib/services/projects.ts, tests/api/projects*.test.ts
depends-on: none
assignee: claude-opus-5 session 6858dcdc, 2026-08-19

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-006.

## What is missing

ux-spec §4.15 PJ-01 lists a star on the project header: "Star (favorites)".
Nothing in the data model or the API supports it.

Favorites exist for saved views only. `views.favorited` is a column and
`POST /api/views/:id/favorite` toggles it (`src/pages/api/views/[id]/favorite.ts`).
Projects have no equivalent column and no route.

T-006 therefore shipped the header without a star rather than rendering a
control that would drop the click, which AGENTS.md forbids.

## The design question to answer first

View favorites are stored as a boolean on the row, which is wrong for anything
per-user: `views.favorited` is a property of the view, not of the viewer.
Copying that shape to projects would bake the same mistake into a second
table, and a project is far more likely than a saved view to be starred by
some members and not others.

So decide, and record the decision in the ticket before writing code: either a
per-user `favorites(user_id, entity_type, entity_id)` table that projects and
views both migrate onto, or a boolean on `projects` that matches the existing
mistake and stays cheap. The first is more work and is probably right. The
second needs an explicit note that it is per-workspace, not per-user.

A migration lands here either way, so it must serialize at the integration
checkpoint per `planning/tickets/README.md`.

## Deliverables

1. The decision above, written down with its reason.
2. Schema plus migration.
3. `POST /api/projects/:id/favorite` mirroring the views route's semantics,
   returning the resulting state.
4. API tests: toggle on, toggle off, a second user's view of the same project,
   and workspace scoping (§7).
5. The star in `src/island/features/projects/project-chrome.tsx`, wired.

## Acceptance

Starring a project survives a reload and does not leak across workspaces. All
four gates green.

## Work log

Session `6858dcdc`, 2026-08-19. Branch `feat/t-029-project-favorites`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  282 files, 0 errors
PASS test   files: 56 passed (56) | tests: 292 passed (292)
PASS e2e    9 passed (10.5s)
ALL GATES PASS
```

### Deliverable 1, the decision

A per-user `favorites` table, not a boolean on `projects`.

`views.favorited` is a boolean on the view row, which makes a star a property
of the thing rather than of the viewer. That is wrong for anything more than
one person touches, and a project is far likelier than a saved view to matter
to one member and not another. Copying it would have baked the same mistake
into a second table, and the mistake is invisible in a single-user test: the
boolean design passes every test in the new file except the isolation one.

Shape is `(workspace_id, user_id, entity_type, entity_id, created_at)` with a
unique index on `(user_id, entity_type, entity_id)`. `entity_type` is there so
pages and cycles can join later without a third table, and its CHECK currently
allows `project` alone, so a future entity is a deliberate migration rather
than a silent widening.

Views are NOT migrated onto it here. That would change the M3 views payload,
which is outside this ticket. The two mechanisms coexist until someone owns
that move.

### Migration

`0002_parallel_warhawk.sql`, purely additive: one CREATE TABLE and two
indexes. No existing table is touched, so it does not have to serialize
against anything currently in flight, but per `planning/tickets/README.md` it
is still the one migration landing in this window.

### Constraint amendment

`owns:` names `src/pages/api/projects/[id]/favorite.ts`, but a star has to be
readable as well as writable, so `favorited` joins the project payload and
`src/pages/api/projects/index.ts` and `[id].ts` thread the actor through. The
list resolves the whole page in one query rather than one per row.

### Falsification

| Break | Failure |
|---|---|
| Drop the `userId` predicate, making the star workspace-wide | `expected true to be false` on the isolation test |

That break is the boolean-on-project design in miniature, and it is the only
test in the file that notices.

