# T-014 — M6b-2 AI dock UI + proposals + settings page

status: open
module: M6 AI layer
assignee: —
owns: src/island/features/ai-dock/**, src/island/features/settings/ai*, edits to src/island/components/shell/{shell-layout,shell-state,topbar,command-palette}.tsx (dock integration points only — log amendments), src/styles/shell.css (dock grid variant), src/lib/keyboard/bindings.ts (Cmd+J row), tests/island/features/ai-dock*, tests/e2e/ai-dock.spec.ts
depends-on: T-013, T-004

> Read `planning/tickets/README.md` first. Implements ux-spec §3.7
> (amended by T-001): persistent right dock, grid column variant.

## docs-to-read
- ux-spec.md §3.7 (AD-01..AD-08 — binding post-T-001), §3.0, §4.22, §10
  (motion: panel-slide reuse), §11 (voice for AI copy)
- design-system.md §4 (dock tokens), §10.6 (SR names)

## Deliverables

- Dock: third grid column (resizable 320–560, default 400, persisted per
  device; `data-dock` variant on pmx-shell-grid; content reflows — issue
  panel keeps overlay semantics, both can be open); `Cmd+J` + topbar AI
  button (SB-13 now toggles the dock) + palette command toggle; open
  state persisted; <768px full-screen sheet (Esc/scrim close, focus
  trap); tablet = dock collapses to sheet too.
- AD elements: session list (recent conversations, new chat, archive),
  thread (markdown rendering, streaming deltas via fetch ReadableStream
  parser — no EventSource), engine badge on every assistant message
  (local/claude-code/model), context chip ("About: PRO-123" / current
  view/page — derived from the active route; detachable), composer
  (Enter send, Shift+Enter newline, Cmd+Enter force), Stop button
  (aborts stream), proposal cards (itemized: label + changed fields;
  Apply runs the REST call client-side under the session, then the
  standard undo toast; Applied state + link to the entity; rejected
  state), "not installed" honest state when the selected provider's CLI
  is missing (+ how to install), degrade banner when falling back to
  local engine.
- `/settings/ai` (R-47) real page: provider picker (with detected-CLI
  status), model, cliPath overrides, tool allowlist checkboxes, per-
  workspace scope, save → PATCH `/api/settings/ai`.
- `/ai` center gains "Open dock" affordance; `/ai/ask` and dock share the
  local thread storage seam.

## Acceptance
RTL: dock open/close/persist, resize bounds, stream parser chunks,
proposal card apply/reject, context chip binding per route, provider
picker save. e2e (mocked or real CLI per environment): Cmd+J opens dock,
send message on local engine → streamed answer + badge; settings page
flow; AT-120…126 happy paths. All four gates green.
