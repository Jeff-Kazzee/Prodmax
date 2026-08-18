# Prodmax → Coding Agent Handoff (2026-08-18, rev 3 — superseded)

> **Superseded.** Pickup brief is now
> `planning/handoffs/2026-08-18-t003-ready.md`. This file is historical
> (M2-era, branch `main`, 85 tests). Do not use it as current state.

**For:** any coding agent or AI pair (Cursor, Claude Code, Codex, ZCode,
Copilot, a human with a terminal — the protocol is the same for all).
**Repo:** `C:\Users\jeffk\big-projects\Prodmax`
(git, branch `main`, remote `origin` = https://github.com/Jeff-Kazzee/Prodmax — public).
**State at handoff:** clean tree, all gates green (check 0 errors · 85/85
vitest · build clean · 6/6 e2e — re-verified after the repo move), no
in-flight work, no running servers.

> The project was MOVED here from `…/Jeff's Agent Workshop/dev/projects/Prodmax`
> on 2026-08-18 to eliminate the apostrophe-path problem class. The old
> location contains only an empty folder + `MOVED.txt`. Do NOT work from the
> old path.

## Start here (in order)

1. `AGENTS.md` — project conventions (binding). Most agents auto-load it;
   if yours doesn't, read it first anyway. (Pointer files `.cursorrules` and
   `CLAUDE.md` exist for tools with their own conventions — they all lead to
   the same place.)
2. `planning/tickets/README.md` — the work protocol: claim the lowest-numbered
   `status: open` ticket whose `depends-on` are all `done`, follow the shell +
   anti-stall rules, run the four gates, commit atomically, flip status.
3. `planning/tickets/T-001…T-021` — the entire remaining build, one
   self-contained ticket per brief (owns / depends-on / docs-to-read /
   deliverables / acceptance). Queue order: T-001 spec amendments → T-002..004
   issues → T-005/006 projects/cycles → T-007..010 docs → T-011..014 AI
   (deterministic engine, then the Claude Code chat dock) → T-015..019 →
   T-020 verification sweep → T-021 polish.
4. `planning/build-state.md` — what's done, key decisions, gotchas ledger.

Built so far: M0 scaffold, M1 data/API core (auth, workspaces, teams, states,
labels — the full Drizzle schema for EVERYTHING already exists), M2 app shell
(router/sidebar/palette/hotkeys/theme/toasts/auth screens). Unbuilt screens
render an honest "Still on the bench" pending component — swap them per ticket.

## Atomic commits & hygiene

- One conventional commit per ticket, or several atomic commits within a big
  ticket at natural seams (API vs UI). Format: `feat(issues): …`,
  `fix(auth): …`, `docs(tickets): …`, `chore: …`.
- Before every commit: `npm run check` (0 errors) → `npm test` (0 failures) →
  `npm run build` (clean) → `npm run e2e` (all pass; builds first). Never
  commit with a red gate — M1b once shipped with `tsc` failing because check
  was skipped.
- Never commit `data/` (runtime SQLite), `.env`, `test-results/`, `dist/`,
  `.astro/`, `.zcode/` (all gitignored — keep it that way).
- Update the ticket's status line + work log in the same commit that lands
  the work. Open a feature branch from `dev`, PR into `dev` only. Do not
  land work on `main`. Promote to `prod` only when Jeff asks to release.
- DB migrations: generate via `npm run db:generate`, commit with the ticket
  that owns the table; serialize migration commits across parallel tickets.

## Environment notes (much simpler now)

- Path is apostrophe-free — no subst drives are involved.
  `scripts/with-subst.mjs` and `scripts/patch-astro.mjs` are dormant no-ops
  kept as safety nets; leave them.
- `resolve.preserveSymlinks: true` in astro.config.mjs is harmless here —
  leave it (it guards any future path weirdness).
- Dev binds 4321, or 4322+ if taken — read the `Local:` log line. Kill
  servers by exact PID (`netstat -ano | grep :4321 | grep LISTEN` →
  `taskkill //PID <pid> //F`), never broad-kill node.
- If dev misbehaves after crashes, clear `.astro/` + `node_modules/.vite`
  (they cache absolute paths) and restart.
- Demo login: `demo@prodmax.dev` / `prodmax-demo` (reseed:
  `npm run db:migrate && npm run seed`). Login rate limit 10/5min/IP — keep
  e2e files ≤6 logins. After login, wait for the real shell
  (`nav[aria-label="Workspace sections"]`) before pressing keys — the URL
  flips before the shell mounts.
- Git Bash on Windows: `taskkill //PID` (double slashes).

## Working style for any agent

- One ticket per conversation/session; plan first, then execute.
- Run the four gates in a terminal before every commit.
- If a ticket feels too big mid-flight (T-009 block editor is the known
  giant), land a coherent subset as its own commit and finish the rest in a
  follow-up — the tickets explicitly allow this.
- For AI-dock tickets (T-013/T-014), read architecture §6 including the
  T-001 amendments first — the safety rules (review-before-write, arg
  allowlists, never via API keys) are binding, not suggestions.
- Environment history (if anything ever acts like the old apostrophe bugs):
  `planning/build-state.md` "Shell rules (historical)".

## Exit criteria

T-020: all AT-001…126 pass against the running app with zero open material
defects in `planning/qa/defect-log.md`; T-021 ships README + badges. All four
gates green on `main`, pushed.
