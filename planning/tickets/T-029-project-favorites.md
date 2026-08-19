# T-029 : PJ-01's star has nothing to write to

status: open
module: M4 projects & cycles
owns: src/db/schema.ts, src/pages/api/projects/[id]/favorite.ts, src/lib/services/projects.ts, tests/api/projects*.test.ts
depends-on: none

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
