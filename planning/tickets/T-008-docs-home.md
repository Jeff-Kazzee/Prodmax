# T-008 — M5b Docs home + page tree + trash

status: open
module: M5 docs engine
assignee: —
owns: src/island/features/docs-home/**, src/island/features/page-tree/**, edits to src/island/components/shell/sidebar.tsx (Pages section SB-02 only) and src/island/app/routes.ts (swaps only), tests/island/features/{docs-home,page-tree}*
depends-on: T-007

> Read `planning/tickets/README.md` first. Swaps: `/docs` (R-22). Adds the
> sidebar Pages tree (SB-02) + Favorites (SB-03) + Recents (SB-04) sections
> from ux-spec §3.2 (recents = last 5 pages/views persisted server-side in
> user prefs — if a user-prefs table is missing, use localStorage and note
> the deferral).

## docs-to-read
- ux-spec.md §3.2 (SB-02..SB-04), §4.17 (S-17 docs home), §21 tree APG
  pattern in design-system.md
- architecture.md §2.6 (path mechanics)

## Deliverables

- **S-17 docs home**: favorites + recents rows; full-width page tree (same
  O(visible) engine as the sidebar tree) with inline rename, drag
  reorder/reparent, emoji/icon picker; template gallery with preview
  dialog → instantiate; Trash tab (30-day, deleted-parent restores
  children); guest explainer card instead of an error.
- **Sidebar SB-02**: expand/collapse chevrons (aria-expanded), child batch
  fetch on expand (<50ms path-indexed else 3-row S-tree skeleton),
  Alt+click expands subtree, active page inset bar, drag hairline
  indicator (reorder) + node highlight (reparent, depth cap, cycle
  detect), kebab (Rename inline, New subpage, Duplicate, Copy link, Move
  to trash + undo toast), "+" on header and node hover.
- **SB-03/SB-04**: favorites from starred views/pages (drag reorder,
  Alt+arrows); recents with mono relative time + dismiss ×, rebuilt on
  route change.
- SB-07 new page affordance: creates server-side immediately then routes
  to the editor (R-24 → R-23).

## Acceptance
RTL: tree expand/lazy fetch, drag reorder/reparent payloads, kebab flows,
favorites reorder, trash restore-cascade. All four gates green; e2e: docs
home → create page from "+" → lands in editor with sidebar node visible.
