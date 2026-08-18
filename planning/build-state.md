# Prodmax Build State — HANDOFF (2026-08-17 after M2; moved + Cursor handoff 2026-08-18)

Read this first in a fresh session, then `planning/plans/build-prodmax.md` and `AGENTS.md`.
Project root: `C:\Users\jeffk\big-projects\Prodmax` (moved 2026-08-18 from the
apostrophe-bearing `…/Jeff's Agent Workshop/…` path — all four gates re-verified
green at the new location; the subst workaround class below is now historical,
the scripts remain as dormant no-ops).

## T-001 amendment (2026-08-18)

Binding docs now include the persistent AI chat dock and local CLI agent
providers (`claude-code` first, `codex` seam). Deterministic engine stays
provider #0. Code is **not** in this amendment — implement in T-013
(backend) and T-014 (dock UI). Next ticket: T-002 (M3a Issues API).

## Phase status

| Phase | Status |
|---|---|
| 1 Research | ✅ planning/research/ + architecture.md + acceptance-tests.md (AT-001…126; T-001 amendment 2026-08-18) |
| 2 UX/Design | ✅ ux-spec.md + design-system.md (AI dock §3.7 + `Cmd+J` in T-001) |
| 3 Build | M0 ✅ 9a6e75b · M1a ✅ 4e1eb47 · M1b ✅ 7dde56c · patch-astro ✅ 020a998 · M1b type-debt fix ✅ 0333f15 · **M2 ✅ f3c881b** · M3–M10 pending |
| 4 Verify | Pending — drive with chrome-devtools MCP + browser agents against AT-001…126 |

## Gate status at handoff (all green)

`npm run check` 0 errors/0 warnings · `npm test` 85/85 (18 files) · `npm run build` clean · `npm run e2e` 6/6 (smoke + shell specs). Demo login `demo@prodmax.dev` / `prodmax-demo`.

## Commits (repo is its own git, branch main)

- 9a6e75b M0 scaffold — Astro 5 + React island + Tailwind/shadcn + Drizzle/SQLite + Vitest + Playwright
- 4e1eb47 M1a schema/FTS5/identifiers/positions/seed (+19 tests)
- 7dde56c M1b auth/sessions/middleware/workspaces/members/invites/teams/states/labels (+47 tests)
- 012ce76 subst-drive build wrapper (apostrophe-path workaround)
- 020a998 patch-astro postinstall, rewritten + self-tested (fixes dev-mode middleware codegen; the earlier mis-escaped version broke `npm run build` at module load)
- 0333f15 M1b type debt cleared: generic `route<T>()`, endpoint-owned Ctx slices, states/[id] null guards (M1b had shipped with tsc failing — 111 errors; `check` was never run after the last M1b edits)
- f3c881b M2 app shell: router R-01…R-49, sidebar/topbar, palette, hotkeys, theming, toasts, auth screens + gate (+16 unit, +6 e2e)

## M2 decisions the next modules must know

- **Shell home**: architecture §8 says `src/app/**`; M0 established the island at `src/island/**` (AGENTS.md). Orchestrator amendment (recorded in f3c881b): shell lives under `src/island/app/**`, `src/island/components/shell/**`, `src/lib/keyboard/**`, `src/lib/theme/**`. Later modules replace ScreenPending routes in `src/island/app/routes.ts` + `src/island/app.tsx` — treat those two files as shared; coordinate at the integration checkpoint.
- **ScreenPending pattern**: every not-yet-built route renders the honest pending screen (`screen-pending.tsx`). A module "lands" a screen by swapping that route's element. Palette/sidebar link only to built surfaces.
- **API Ctx slices**: endpoints now declare `route(async (ctx: { request; params? }) => …)` — no APIRoute annotation, no casts. New endpoints (M3+) MUST follow this (see any file in `src/pages/api/` post-0333f15).
- **Theme/density**: next-themes (class on `<html>`, key `pmx-theme`, dark default) + `data-density` on `<html>` (key `pmx-density`). Server-side prefs deferred (users PATCH only takes name/avatarSeed today).
- **e2e conventions** (`tests/e2e/shell.spec.ts`): after login, WAIT for `nav[aria-label="Workspace sections"]` before pressing keys (URL flips before the shell mounts — keybindings race). Login rate limit is 10 attempts/5 min/IP — keep the file's login count ≤6. Use `#login-email`/`#login-password` ids, not getByLabel (collides with "Show password").

## Subagent lessons (this session, hard-won)

- The M2 build agent stalled (killed at 10-min inactivity) AFTER writing ~2.9k correct lines — its remaining work was verification + e2e. Recovery that worked: `git status` → survey partial output → finish + fix in the main session (orchestrator) rather than relaunching. Prefer smaller agent briefs with explicit "verify after each batch" steps; a module this size may need splitting (e.g. "shell layout+router" then "palette+hotkeys+e2e").
- Agents must run `npm run check` themselves before reporting — M1b's false "done" came from skipping it.

## Recovery checklist for the next session

1. `npm test` → 85 passing · `npm run check` → 0 errors (fast confidence)
2. Start dev: `npm run dev` (background), check "Local:" port, curl `/api/health`
3. Continue with M3.

## Handoff note (2026-08-18 → Cursor)

Build handed to Cursor with ALL 21 tickets `open` (a T-002 agent was started
and stopped before writing anything — no in-flight work, tree clean). Every
session — Cursor, ZCode, or otherwise — follows `planning/tickets/README.md`.
Dev server stopped and subst mappings cleaned (the wrapper removes what it
creates; a leftover mapping for our path is safe — the wrapper reuses it).
GitHub remote: origin/main — push after each ticket's verification.
Full agent handoff doc: `planning/handoffs/2026-08-18-agent-handoff.md`.

## Next modules (one agent each, exclusive ownership per architecture §8)

**The work queue now lives in `planning/tickets/` (T-001…T-021)** — read
`planning/tickets/README.md` for the claim/verify protocol; each ticket is a
self-contained brief (owns/depends-on/deliverables/acceptance). T-001 spec
amendments landed 2026-08-18 (docs). Order after that: T-002..T-004 M3 issues →
T-005/T-006 M4 → T-007..T-010 M5 docs → T-011/T-012 M6a deterministic AI →
T-013/T-014 M6b agent chat → T-015 M7 → T-016/T-017 M8 realtime → T-018 M9 →
T-019 M10 → T-020 verification sweep → T-021 polish. Parallel-safe chains
noted in the tickets README. The orchestrator verifies all four gates +
commits after each ticket; standalone agents may commit per the README
protocol.

## Shell rules (hard-won — historical since the 2026-08-18 move to big-projects)

The ORIGINAL workspace path contained an apostrophe (Jeff's), which broke Astro codegen that single-quotes paths. Mitigations were: `scripts/with-subst.mjs` (dev/build/preview wrap on a subst drive) + `scripts/patch-astro.mjs` (postinstall, self-tested, idempotent — verified end-to-end 2026-08-17). Both remain in the repo as dormant no-ops for apostrophe-free paths. The records below explain why they exist — read before ever moving the project back onto an apostrophe-bearing path.

**Dev-mode hydration fix (2026-08-18)**: dev servers must run with `resolve.preserveSymlinks: true` (now in astro.config.mjs). Without it Vite realpaths module ids to the real `C:/…Jeff's Agent Workshop/…` spelling while the fs root is the subst drive, and those `/@fs/C:/…` URLs (spaces + apostrophe) fall through the `[...slug]` catch-all as HTML — the island never hydrates in dev (production preview was never affected; e2e always ran against preview, which is why this hid). The wrapper now also REUSES an existing subst mapping for the same dir (stable drive letter → caches stay valid) and only unmaps letters it created — hard `taskkill //F` kills used to strand mappings (V:/Y:/Z: all pointed at the same dir; different letters per run poisoned `.astro/` and `node_modules/.vite`). Known benign: one swallowed `ERR_INVALID_URL_SCHEME` rejection at dev boot (Astro watcher does `new URL(component, config.root)` while root is a plain `Y:/…` string); no functional impact — routes, HMR, hydration all work. Fix later via patch-astro if the noise bothers anyone.

- NEVER `cd /y/...` (any subst drive) in the main session shell — the persistent cwd dies when the wrapper cleans up and EVERY later command ENOENTs, session-wide, including subagents.
- Kill dev/preview servers by port PID only (`netstat -ano | grep ":4321" | grep LISTEN` → `taskkill //PID <pid> //F`); never broad node kills.
- `npm run dev`/`preview` may bind 4322+ if 4321 is taken — read the "Local:" log line.
- Subagent anti-stall rules (include in every build-agent brief): chunks ≤250 lines, writes ≤200 lines per call, test after each batch, SHORT report immediately on completion, and run `npm run check` before reporting.
