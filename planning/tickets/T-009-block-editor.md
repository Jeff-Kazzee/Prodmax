# T-009 — M5c Block editor core

status: open
module: M5 docs engine
assignee: —
owns: src/island/features/page-editor/**, src/components/blocks/**, edits to src/island/app/routes.ts (swaps only), tests/island/features/page-editor*, tests/island/components/blocks*
depends-on: T-007

> Read `planning/tickets/README.md` first. Swaps `/docs/page/:id` (R-23)
> and `/docs/page/new` (R-24 → creates then redirects). This is the
> single biggest UI ticket — if you stall, finish a coherent subset
> (paragraph/heads/lists/todo/toggle/quote/divider/code + slash + md
> shortcuts + autosave) and log the remainder rather than going silent.

## docs-to-read
- ux-spec.md §4.18 (S-18), §5 (block editor interactions — binding), §3.0
- architecture.md §2.6 (19 block types + props/children contracts), §9
  (perf: 5k-block page <150ms server, <16ms/frame typing)
- design-system.md §4.2 density, §10 a11y (editor semantics)

## Deliverables

- Frame: breadcrumb/icon/title (inline edit) + block canvas + right rail
  (Comments/Backlinks/History/Info tabs, `Cmd+.` toggle; Comments/History
  may stub to "lands with M8" empty states — honest, no fake controls).
- Block behaviors per §5: Enter splits same-type (empty list item exits
  list), Backspace merges/upgrades toward paragraph, `/` slash menu
  (fuzzy filter; AI group rows render only when T-012 lands — leave the
  seam), markdown auto-format (`-`,`1.`,`#`,`[]`,`>`,```` ``` ````, inline
  `**`/`*`/`` ` ``), drag with 24px nest-left zone (children only where
  the type contract allows), Turn into (compatible types only),
  multi-block selection = one batch transaction, per-type controls (todo
  checkbox, callout emoji, code language, image upload w/ alt prompt —
  uploads via the attachments table + `data/uploads/<wsId>/`), bookmark,
  table grid nav (cells inline in props, no child blocks), toggle
  collapse persisted.
- `@` mentions (hover cards, member validation warning) + `PRO-` autolink
  to issue panel.
- 100-step undo with visible counter; 800ms debounced autosave + offline
  queue (replays on reconnect); per-block version → 409 reconciliation.
- Virtualize long pages (windowing consistent with §9 budgets).

## Acceptance
RTL: split/merge/exit-list keymap, markdown auto-format cases, slash
filtering, drag/nest rule enforcement, multi-select batch payload, undo
depth cap, autosave debounce + queue replay. All four gates green; e2e:
type markdown lines → correct block types persist after reload.
