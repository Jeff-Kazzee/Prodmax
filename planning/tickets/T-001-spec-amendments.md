# T-001 — Phase A spec amendments (AI dock + agent providers)

status: done
module: planning docs
assignee: Cursor Grok 4.6 — 2026-08-18
owns: planning/architecture.md, planning/design/ux-spec.md, planning/research/feature-matrix.md, planning/qa/acceptance-tests.md, planning/build-state.md
depends-on: —

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Amend the binding docs for the approved 2026-08-18 scope: persistent AI chat
dock in the shell, `claude-code`/`codex` local CLI agent providers
(chat + propose, human applies), offline deterministic engine retained as
provider #0. Code changes happen in T-013/T-014 — this ticket is docs only.

## docs-to-read
- architecture.md §6 (all), §3.8, §2.9
- ux-spec.md §3.3–§3.4, §4.22, §6 (keyboard map)
- feature-matrix.md FM-073 row + tier totals; acceptance-tests.md header + FM matrix

## Deliverables

1. architecture §6: new §6.5 "Local CLI agent providers" — `claude-code`
   (first; headless stream-json + `--resume`) and `codex` (seam), spawned as
   local subprocesses under the user's own CLI auth; never reachable via M9
   API keys. Chat transport: `POST /api/ai/chat/conversations/:id/messages`
   responding `text/event-stream` (`chat-delta`/`done`/`error` events) —
   separate from M8's workspace EventSource by design. Safety invariants:
   arg allowlist, hard timeout, output caps; proposals = validated
   endpoint-call shapes ({method, path, body, label}) rendered as itemized
   Apply cards whose Apply runs under the user's session via the SAME REST
   endpoints (no server-side replay of stored requests); ai_runs engine
   label `provider:claude-code:<model>`; degradation to local engine.
2. architecture §2.9: add `agent_conversations` (id PK, workspace_id FK,
   user_id FK, provider, cli_session_id TEXT NULL, context json, title,
   created_at/updated_at/archived_at; index workspace_id, updated_at) and
   `agent_messages` (id PK, conversation_id FK CASCADE + index, role
   user|assistant|system|tool, content_md, proposals json NULL, ai_run_id
   NULL FK, created_at).
3. architecture §3.8: replace the single `/api/ai/chat` row with the
   conversation set: POST/GET `/api/ai/chat/conversations`,
   GET/DELETE `/api/ai/chat/conversations/:id`,
   POST `/api/ai/chat/conversations/:id/messages` (text/event-stream),
   plus GET/PATCH `/api/settings/ai` (per-workspace chatProvider, model,
   cliPath overrides, tool allowlist).
4. ux-spec: §3.3 SB-13 click toggles the AI dock (dropdown items folded
   into dock + AI center). New §3.7 "AI dock (AD-01..AD-08)": right-side
   grid column (resizable 320–560, default 400; `Cmd+J`; topbar button;
   palette command; full-screen sheet <768px; dock reflows content while
   the issue panel overlays — coexistence rule). Elements: session list,
   thread, engine badge, context chip ("About: PRO-123 / current view"),
   composer, Stop, proposal cards, resize handle. §6 keyboard map: add
   `Cmd+J` "Toggle AI dock". §4.22: dock is the primary chat surface; the
   `/ai/ask` page and dock share threads.
5. feature-matrix: FM-073 → Must, description covers dock + Claude
   Code/Codex + propose/apply; update tier totals (72 Must / 16 Should).
6. acceptance-tests: add Group 22, AT-120…126: dock open/close+persist
   (120), Claude Code round-trip with mocked CLI (121), proposal→apply→undo
   (122), provider picker in settings incl. "not installed" state (123),
   degradation to local engine labeled (124), streaming deltas + Stop +
   resumable session (125), context injection visible in chip + ai_run
   input_hash (126). Update total count to 126 and FM-073's AT refs.
7. build-state.md: note the amendment landed; point next work at tickets.

## Acceptance
Four gates unaffected (docs only) but still run `npm run check` (markdown
inside repo, ensure no code drift). Diff reviewed by orchestrator before
commit.

## Work log (2026-08-18)

- Files: `planning/architecture.md` (§2.9 agent tables, §3.8 conversation API + `/api/settings/ai`, §6.5 CLI providers, §8 M6/M10 `settings/ai*` exception), `planning/design/ux-spec.md` (SB-13 toggle, §3.7 AD-01..08, `Cmd+J`, §4.22 share threads, ST-90 not-installed), `planning/research/feature-matrix.md` (FM-073 Must; 72/16/2), `planning/qa/acceptance-tests.md` (Group 22 AT-120…126; total 126), `planning/build-state.md` (amendment note → T-002).
- Tests added: none (docs). Gates: `npm run check` 0 errors / 0 warnings / 6 pre-existing hints.
- Deviations: none. Not committed (await orchestrator / explicit commit ask).

