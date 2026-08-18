# T-016 — M8a Realtime backend (bus/SSE/presence)

status: open
module: M8 realtime
assignee: —
owns: src/lib/events/**, src/lib/constants.ts, src/lib/sse/**, src/pages/api/events/**, src/pages/api/presence/**, src/pages/api/notifications/**, src/pages/api/activity/**, src/lib/services/{notifications,activity}*, tests/api/{events,presence,notifications}*
depends-on: T-002

> Read `planning/tickets/README.md` first. This repays M1's never-shipped
> event-bus debt. constants.ts becomes shared约束 — coordinate via the
> integration checkpoint.

## docs-to-read
- architecture.md §5 (SSE design — binding), §4.1 (payload envelope),
  §2.8 (comments/notifications/activity tables), §2.9 (event_log,
  presence_sessions), §3.7 (endpoint list)
- ux-spec.md §9 (realtime UX contract your events drive)

## Deliverables

- src/lib/constants.ts: SSE event names (issue.created/updated/deleted,
  view.updated, notification.created, presence.ping/leave, hello, ping),
  error codes, block-type enum, role names (backfill — M0/M1 used literal
  strings; migrate the literals to the constants module WITHOUT behavior
  change).
- Event bus: service-layer emit choke-points (the seams T-002/T-007
  structured) → event_log writer (append-only, ws-scoped) + in-process
  subscriber fan-out.
- GET `/api/events?wsId=`: EventSource; session auth; `id:` =
  event_log.id; Last-Event-ID replay; 25s ping keepalive; `resync` event
  beyond 7-day retention; graceful multi-connection (per-user tabs).
- POST `/api/presence` heartbeat + viewing entity; TTL sweep.
- Notifications + activity endpoints (from §2.8 tables; mention→
  notification fan-out wired into comment creation seam).

## Acceptance
Vitest: event envelope shape byte-exact vs §4.1, replay from
Last-Event-ID, prune behavior, presence TTL, notification fan-out on
@mention. All four gates green (node adapter streams — integration test
via supertest-style raw socket or the preview server if needed).
