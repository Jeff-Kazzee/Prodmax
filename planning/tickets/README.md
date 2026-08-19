# Prodmax Ticket System

Durable, self-contained work tickets so ANY agent (orchestrator subagent,
standalone session, or human-driven) can pick up the next unit of work without
a specific orchestrator being present. Approved source plan:
`planning/plans/build-prodmax.md` + the 2026-08-18 amendment (AI dock + local
agent providers, recorded in architecture §6 and ux-spec §3.7).

## How to work a ticket

1. Pick the lowest-numbered `status: open` ticket whose `depends-on` are all
   `done`. Set `status: claimed` and add an `assignee:` line (session id or
   agent name + date) in the ticket's header block.
2. Read this README fully, then the ticket fully, then the ticket's
   `docs-to-read` sections in ≤250-line chunks. Do not skip the shell rules.
3. Build. Run tests after each work batch. Keep every file write ≤200 lines
   per tool call (split large files across calls).
4. Before reporting done, run ALL FOUR gates and paste counts into the
   ticket's Work log: `npm run check` (0 errors), `npm test` (0 failures),
   `npm run build` (clean), `npm run e2e` (all pass; needs a fresh build —
   `npm run build` then the config's preview webServer handles itself).
5. Append a SHORT work log to the ticket (files touched, tests added, gate
   results, deviations). Set `status: in-review`.
6. Commits: inside an orchestrator session the ORCHESTRATOR verifies and
   commits (agents commit nothing). Working standalone: commit yourself per
   AGENTS.md conventions (conventional, atomic, one ticket = one or more
   atomic commits on a **feature branch cut from `dev`**). Open a PR into
   `dev` only — never into `prod`. Then set `status: done`. Never commit
   directly to `prod` or `dev`. Never commit `data/` or `.env`. `prod` is
   the finished product; promote `dev` → `prod` only when Jeff asks to
   release.
7. Blocked? Set `status: blocked`, write why in the ticket, move on. Never
   edit files outside your ticket's `owns:` list — file a "constraint
   amendment needed" note instead (architecture §8 overlap rule).

Status legend: `open` → `claimed` → `in-review` → `done` | `blocked`.

## Shell rules

The project lives at `C:\Users\jeffk\big-projects\Prodmax` (moved here
2026-08-18 from the apostrophe-bearing `…/Jeff's Agent Workshop/…` path —
the subst/patch workaround class is now historical). The mitigation scripts
remain as dormant no-ops (`scripts/with-subst.mjs` passes through on
apostrophe-free paths; `scripts/patch-astro.mjs` exits silently) — keep them.

- Dev servers bind 4321, or 4322+ if taken — read the `Local:` log line
  before assuming the port. Kill servers by exact PID only
  (`netstat -ano | grep ":4321" | grep LISTEN` → `taskkill //PID <pid> //F`);
  never broad-kill node.
- If dev misbehaves after a crash or a directory move, clear `.astro/` and
  `node_modules/.vite` (both cache absolute paths) and restart.
- `resolve.preserveSymlinks: true` in astro.config.mjs is harmless here; it
  was required when the dev root was a subst drive.

## Anti-stall rules (violations get agents killed at 10-min inactivity)

- No silent marathons: read in ≤250-line chunks, write in ≤200-line chunks.
- Test after each batch; keep the suite green incrementally.
- Run `npm run check` before reporting (a module once shipped with tsc
  failing because check was skipped — do not repeat it).
- Reply with a SHORT report immediately when done (<40 lines).

## Demo data

Login `demo@prodmax.dev` / `prodmax-demo` (reseed: `npm run db:migrate &&
npm run seed`). Login rate limit: 10 attempts / 5 min / IP — keep e2e files
at ≤6 logins.

## Index

| Ticket | Title | Status |
|---|---|---|
| T-001 | Phase A spec amendments (AI dock + agent providers) | done |
| T-002 | M3a Issues API + services | done |
| T-003 | M3b Issue views UI (list/board/table/filter/views) | done |
| T-004 | M3c Issue panel + new-issue modal + triage | done |
| T-005 | M4a Projects/cycles API | done |
| T-006 | M4b Projects/cycles UI | open |
| T-007 | M5a Docs API (pages/blocks/templates/search) | open |
| T-008 | M5b Docs home + page tree + trash | open |
| T-009 | M5c Block editor core | open |
| T-010 | M5d Templates + embedded issue views | open |
| T-011 | M6a-1 Deterministic AI engine lib | open |
| T-012 | M6a-2 AI endpoints + in-context UI | open |
| T-013 | M6b-1 Agent chat backend (CLI providers, streaming) | open |
| T-014 | M6b-2 AI dock UI + proposals + settings page | open |
| T-015 | M7 Insights | open |
| T-016 | M8a Realtime backend (bus/SSE/presence) | open |
| T-017 | M8b Realtime client + reconnect UX | open |
| T-018 | M9 Integrations (keys/webhooks/CSV) | open |
| T-019 | M10 Settings/admin | open |
| T-020 | Phase C verification sweep (epic) | open |
| T-021 | Polish: README, badges, release | open |
| T-022 | T-005 remediation spec amendments (docs only) | done |
| T-023 | Workflow state writes corrupt project progress | open |
| T-024 | Consumer policy and version monotonicity (pre-T-016) | open |

Parallelism note: tickets in different chains are file-disjoint per
architecture §8 and MAY run in parallel (e.g. the T-007…T-010 docs chain vs
the T-005/T-006 projects chain), but DB migrations must be serialized at the
integration checkpoint (one module's migration lands before the next
generates).
