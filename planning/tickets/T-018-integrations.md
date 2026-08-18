# T-018 — M9 Integrations (keys/webhooks/CSV)

status: open
module: M9 integrations
assignee: —
owns: src/pages/api/{keys,webhooks,import,export}/**, src/lib/webhooks/**, src/island/features/integrations/**, tests/api/{keys,webhooks,import-export}*
depends-on: T-016

> Read `planning/tickets/README.md` first. Swaps `/settings/api-keys`
> (R-42), `/settings/webhooks` (R-43 + :id R-44), `/settings/import-export`
> (R-45).

## docs-to-read
- architecture.md §2.9 (api_keys/webhooks/webhook_deliveries), §3.9
  (endpoints + the 1,000 req/h/key budget), §6.4 + T-013's guard
- feature-matrix FM-074..078; ux-spec §4.23 settings screens

## Deliverables

- API keys: issue-once `pmx_…` secrets (SHA-256 stored), prefix display,
  scopes, revoke; auth middleware accepts keys as the owning user with
  scope checks; rate limit 1,000/h/key burst-friendly. HARD RULE: key
  auth can NEVER reach agent-spawn endpoints (extend T-013's guard —
  shared test).
- Webhooks: CRUD, https enforced, HMAC signing, event subscription,
  dispatcher subscribing to the T-016 bus, delivery queue with
  1m/5m/30m/2h/6h retries, dead-letter + manual redelivery UI.
- CSV import/export for issues (headers contract documented in-app;
  import = preview + commit two-phase; export streaming download).
- Settings screens for all three; import preview table with per-row
  validation states.

## Acceptance
Vitest: key auth + scopes + rate limit, HMAC signature verify, retry
schedule + dead-letter, CSV round-trip + validation previews, agent-guard
shared test. All four gates green.
