# T-030 : the issue view engine can only be scoped by pathname

status: open
module: M3 issues
owns: src/island/features/issues/**, src/island/features/issue-detail/property-strip.tsx, src/island/features/issue-create/commands.ts, tests/island/features/issues/**
depends-on: T-006

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-006. Four separate gaps, one owner, because they all
live inside `src/island/features/issues/**` and every one of them was blocked
for T-006 by the same module boundary (architecture §8).

## 1. Scoping is pathname-driven, so an embedder cannot lock a filter

`presetForPath` in `src/island/features/issues/presets.ts` derives the locked
filter from `useLocation().pathname`. That works for R-19, where the project id
is in the path, and T-006 uses it: `ProjectScreen` owns
`/project/:id/{board,list}` and mounts `<IssueViewsScreen />` unchanged.

It does not work for R-20. `/cycle/current` carries no cycle id, so there is no
pathname to read, and `presets.ts` is outside T-006's owns list. S-16 therefore
renders its scoped issues itself in
`src/island/features/cycles/scope-panel.tsx` and offers a board link that
carries the filter in `?f=`, which the user can remove. ux-spec §4.16 CY-04
asks for the real S-08 engine scoped to `cycle is current`.

Wanted: an optional prop, roughly `lockedFilter?: FilterNode` plus a title,
that `IssueViewsScreen` ANDs in and renders as a non-removable chip. The
pathname presets keep working and become one caller of it.

## 2. No cycle preset

Add `/cycle/:id` and `/cycle/current` presets once (1) exists, so the cycle
board is the same engine rather than a second list.

## 3. The scoping keyboard and drag affordances

ux-spec §4.16 CY-03 wants a backlog drawer with drag onto the board, and
`Shift+C` to scope the focused issue from any list. §4.15 PJ-04 wants
`Shift+M` and drag onto a milestone row. All three need drop targets and key
handlers inside the engine, so none could ship in T-006. Scoping is currently
Add and Remove buttons with undo toasts, which works and is honest but is
slower than the spec intends.

## 4. The issue panel still has no project, cycle or milestone chips

`src/island/features/issue-detail/property-strip.tsx:2` says these "wait for
T-005 lookups, so they are omitted rather than faked". T-005 shipped. The
lookups exist.

This one matters more than it looks. Until it lands, the only way in the whole
app to put an issue into a project is the picker T-006 added at
`src/island/features/projects/add-issues-dialog.tsx`, and the only way to scope
one to a cycle is the S-16 panel. The e2e in `tests/e2e/projects.spec.ts`
depends on that picker for exactly this reason.

Related: `CreatePrefill` in
`src/island/features/issue-create/commands.ts` has no `projectId`, so "new
issue" from a project cannot land in that project. One field plus one spread.

## Deliverables

1. `lockedFilter` support in the engine, with a non-removable chip.
2. Cycle presets built on it, and S-16 switched over (coordinate with the
   T-006 owner, `src/island/features/cycles/**`).
3. `Shift+C` and `Shift+M`, and drag onto a milestone row and a cycle board.
4. Project, cycle and milestone chips in the property strip, each a real PATCH.
5. `CreatePrefill.projectId` and `cycleId`.

## Acceptance

RTL: a locked filter cannot be removed from the chip bar; `Shift+C` scopes the
focused issue and the undo toast unscopes it; the property strip PATCHes
`projectId`. All four gates green.
