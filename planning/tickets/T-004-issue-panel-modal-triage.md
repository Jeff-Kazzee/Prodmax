# T-004 — M3c Issue panel + new-issue modal + triage

status: open
module: M3 issues engine
assignee: —
owns: src/island/features/issue-detail/**, src/island/features/issue-create/**, src/island/features/triage/**, edits to src/island/app/routes.ts (route swaps only), tests/island/features/{issue-detail,issue-create,triage}*
depends-on: T-003

> Read `planning/tickets/README.md` first. Swaps: `/issue/:identifier`
> (R-11 panel + full page), `/team/:teamKey/new` (R-15), `/triage` (R-16).

## docs-to-read
- ux-spec.md §4.12 (S-12 panel), §4.13 (S-13 new-issue modal), §4.14 (S-14
  triage), §3.4 (panel slot semantics), §6 (focus/Esc rules)
- architecture.md §3.4 (history/description-versions/comments endpoints
  you consume)

## Deliverables

- **S-12 issue panel**: portal into `pmx-panel-slot`; w-480 panel / w-720
  full page with identical anatomy; every property chip inline-edits with
  single-key focus shortcuts; tabs Description/Comments/Activity/Relations/
  Sub-issues/Attachments lazily fetched; markdown Write/Preview + version
  history restore; comments Cmd+Enter, @mentions, resolve/reopen, convert
  to sub-issue; activity ledger; relations with blocking banner; sub-issue
  bulk paste-create; Esc closes + restores row focus; `?issue=PRO-123`
  shareable truth; old identifiers redirect with one-time banner.
- **S-13 new-issue modal**: `C` opens modal (register in the M2 keyboard
  layer via a command exported from this feature — do not edit
  keyboard-layer.tsx beyond a single registration point if unavoidable;
  log it), `V` full editor; autofocus title; >400ms typing → dedup banner
  placeholder (surface `suggestions` from T-002 response; the AI engine
  behind it lands in T-012 — render whatever the API returns); property
  ghost chips; create-another; Cmd+Enter optimistic create; Esc saves
  server-side draft; `?title=&priority=` URL prefill.
- **S-14 triage inbox**: `G T`; J/K rows; `1` accept (note composer,
  require-priority gate), `2` duplicate-merge flow side-by-side diff,
  `3` decline → Canceled; `H` snooze; `X` bulk accept; suggestion strip
  renders API `why` data when present; triage rows excluded from normal
  views (filter in the list hook).
- Topbar SB-15 New-issue button + bottom-nav center button become real
  (small edits to shell files — log them as amendments).

## Acceptance
RTL tests: panel open/close focus restore, tab lazy fetch, property edit
optimism + rollback, comment flows, modal create + create-another + draft
restore, triage keymap. All four gates green; one e2e: create issue via
`C`, open panel via row, edit priority, Esc focus back.
