# T-017 — M8b Realtime client + reconnect UX

status: open
module: M8 realtime
assignee: —
owns: src/island/features/realtime/**, src/island/features/inbox/**, src/island/features/activity/**, edits to shell sync dot (SB-19) + reconnect banner (SB-21) + presence stack (SB-12) integration points (log amendments), tests/island/features/realtime*
depends-on: T-016

> Read `planning/tickets/README.md` first.

## docs-to-read
- ux-spec.md §9 (all — binding: presence avatars, editing indicators,
  change toasts for open entities, LWW conflict policy, reconnect banner
  state machine), §3.3 SB-12/19, §3.4 SB-21
- architecture.md §5, §4.1

## Deliverables

- SSE client hook (EventSource + reconnect backoff + resync handling +
  per-entity subscription cache); presence heartbeat + viewing context.
- Sync dot SB-19 goes real: synced / retrying (2s pulse, the only pulsing
  element) / offline / queued states; tooltip copy per spec.
- Reconnect banner SB-21: sticky strip only while reconnecting/offline;
  pushes content 36px (the push IS the signal); state machine §9.5.
- Presence stack SB-12 in topbar (current entity roster, >3 → "+n",
  HoverCard); editing indicators on open issue/page; change toasts for
  open entities patched by others (LWW per field §9.4).
- Live patches in T-003 views (S-07 row insert/patch/fade-out — no toasts
  in lists), embedded issue_view refresh (T-010 seam), inbox `/inbox`
  (R-07) screen + unread badge on SB-14 bell (increments live, 150ms
  scale-in).

## Acceptance
RTL with a fake EventSource: envelope routing, reconnect states, LWW
merge, badge increments. e2e (two pages via Playwright fixtures if
feasible, else simulated events): row updates live in a second tab.
All four gates green.
