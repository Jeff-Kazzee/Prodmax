# T-004 — M3c Issue panel + new-issue modal + triage

status: done
module: M3 issues engine
assignee: Cursor Grok 2026-08-18
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

## Work log — 2026-08-18 Cursor Grok

**Files:** `src/island/features/issue-detail/**` (S-12 panel/page, property
strip, lazy tabs, comments), `src/island/features/issue-create/**` (S-13
modal, localStorage draft, C/V via ShellState), `src/island/features/triage/**`
(S-14 inbox). Route swaps in `src/island/app.tsx`. Hide-triage in
`use-issues.ts` unless `includeTriage`.

**M2 additive (constraint):** C/V, New issue, and overlay flags live on
`shell-state.tsx` so the keyboard layer, topbar, and bottom-nav share one
create request. Keyboard layer pauses while the modal is open. `g t` joins
existing `g b` for Triage. CSRF Origin matching treats localhost and
127.0.0.1 as the same host so browser POSTs from preview work.

**Tests:** panel Esc + focus restore, comments lazy fetch, priority
rollback, Cmd+Enter comment, modal create-another + draft restore, triage
`1` accept. e2e: C, create, open panel, edit priority, Esc restores row
focus. CSRF unit: Origin `localhost:4321` vs listen address `127.0.0.1`.

**Gates:** `npm run check` 0 errors · `npm test` 121/121 · `npm run build`
clean · `npm run e2e` 8/8.

**PR:** https://github.com/Jeff-Kazzee/Prodmax/pull/7 into `dev`.

**Deviations / follow-ups:**
- No drafts or attachments API in T-002. Drafts are localStorage. Attachments
  tab is empty honest copy.
- Dedup banner is silent on 404 (T-012). Other errors toast.
- Snooze is local until M8. Merge is identifier + duplicate relation, not a
  side-by-side diff.
- Project/cycle/milestone chips omitted (T-005). AI summarize/related wait
  T-011/T-012. SSE/presence wait T-016.
- Favorites sidebar SB-03 still needs an M2 constraint amendment (T-003).

