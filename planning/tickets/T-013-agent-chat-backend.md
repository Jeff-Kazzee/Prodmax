# T-013 — M6b-1 Agent chat backend (CLI providers, streaming, settings)

status: open
module: M6 AI layer
assignee: —
owns: src/lib/ai/providers/**, src/lib/agent/**, src/pages/api/ai/chat/**, src/pages/api/settings/ai*, src/db/migrations (agent tables), src/db/schema.ts (agent tables ONLY — additive), tests/api/ai-chat*, tests/unit/agent*
depends-on: T-001

> Read `planning/tickets/README.md` first. Step 0: verify CLIs on this
> machine (`claude --version`, `codex --version`). The tests MUST use a
> mocked CLI binary (a fixture script that speaks stream-json) — never
> require the real CLIs in CI/gates.

## docs-to-read
- architecture.md §6 (incl. the T-001 amendments: §6.5 local CLI agent
  providers, agent_conversations/agent_messages tables, chat streaming
  transport), §6.4 defenses (binding)
- ux-spec.md §3.7 (the dock this backend serves), §4.22

## Deliverables

- `claude-code` provider: spawn the configured CLI headless
  (`--print --output-format stream-json --input-format stream-json`,
  `--resume <cli_session_id>` for continuity, `--model` from settings);
  normalize stream-json events → internal chat-delta/done/error; arg
  ALLOWLIST (no shell interpolation — spawn with argv array, shell:false);
  hard timeout (default 120s, configurable); output cap; kill on abort.
- `codex` provider seam: same interface over `codex exec --json`; may
  start as a stub that reports NOT_INSTALLED until T-014+ polish.
- Provider registry: local (#0, always first) + claude-code + codex;
  per-workspace selection from settings; degradation rule — provider
  missing/error → local engine answers, labeled, never an error wall.
- Tables + migration: agent_conversations, agent_messages per amended
  §2.9 (T-001 text is the contract).
- Endpoints: POST/GET `/api/ai/chat/conversations`,
  GET/DELETE `/:id`, POST `/:id/messages` → `text/event-stream`
  (chat-delta/done/error; Stop = client abort → provider kill + partial
  message persisted). Messages carry `proposals` json: validated
  {method, path, body, label} shapes (server validates method+path
  against an allowlist of workspace REST routes and entity ids against
  the schema BEFORE storing; unknowns stripped + flagged in the payload).
  Apply is client-side (the dock calls the REST endpoint under the user's
  session) — no server-side replay endpoint.
- Settings: GET/PATCH `/api/settings/ai` (chatProvider: local |
  claude-code | codex; model; cliPath overrides; tool allowlist flags);
  detection of installed CLIs exposed in GET for the settings UI.
- ai_runs logging per message run (engine `provider:claude-code:<model>`).
- HARD GUARD (binding): agent spawn paths reject requests authenticated
  via API keys (M9) — session cookie only. Write the guard now.

## Acceptance
Vitest with the mock CLI fixture: full round-trip streaming, resume,
timeout kill, abort mid-stream + partial persist, proposal validation
(allowlisted route ok / unknown route stripped), degradation to local,
settings round-trip, api-key guard 403s. All four gates green.
