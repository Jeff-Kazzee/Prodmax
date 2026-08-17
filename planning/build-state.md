# Prodmax Build State — HANDOFF (2026-08-17, after M2)

Read this first in a fresh session, then `planning/plans/build-prodmax.md` and `AGENTS.md`.
Work from the real path `C:\Users\jeffk\Jeff's Agent Workshop\dev\projects\Prodmax` —
NEVER `cd` onto a subst drive (Y:) in the main shell; see Shell rules below.

## Phase status

| Phase | Status |
|---|---|
| 1 Research | ✅ planning/research/ + architecture.md + acceptance-tests.md (AT-001…119) |
| 2 UX/Design | ✅ ux-spec.md + design-system.md |
| 3 Build | M0 ✅ 9a6e75b · M1a ✅ 4e1eb47 · M1b ✅ 7dde56c · patch-astro ✅ 020a998 · M1b type-debt fix ✅ 0333f15 · **M2 ✅ f3c881b** · M3–M10 pending |
| 4 Verify | Pending — drive with chrome-devtools MCP + browser agents against AT-001…119 |

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

## Next modules (one agent each, exclusive ownership per architecture §8)

**M3 issues engine** → `src/pages/api/{issues,comments,views}/**`, `src/features/issues/**`, `src/components/issues/**` (FM-012..020, 021..027, 029, 038..040 incl. triage UI; filter DSL per architecture §4; swap the issue routes' ScreenPending for real screens; wire sidebar team-section links). Then M4 projects/cycles → M5 docs → M6 AI → M7 insights → M8 realtime → M9 integrations → M10 settings/admin → Phase 4 verification. Module briefs derive from architecture §3 endpoints + §8 ownership, ux-spec screens, design-system tokens. The orchestrator verifies all four gates + commits after each module.

## Shell rules (hard-won — read twice)

The workspace path contains an apostrophe (Jeff's), which breaks Astro codegen that single-quotes paths. Mitigations: `scripts/with-subst.mjs` (dev/build/preview wrap on a subst drive) + `scripts/patch-astro.mjs` (postinstall, self-tested, idempotent — verified end-to-end 2026-08-17).

- NEVER `cd /y/...` (any subst drive) in the main session shell — the persistent cwd dies when the wrapper cleans up and EVERY later command ENOENTs, session-wide, including subagents.
- Kill dev/preview servers by port PID only (`netstat -ano | grep ":4321" | grep LISTEN` → `taskkill //PID <pid> //F`); never broad node kills.
- `npm run dev`/`preview` may bind 4322+ if 4321 is taken — read the "Local:" log line.
- Subagent anti-stall rules (include in every build-agent brief): chunks ≤250 lines, writes ≤200 lines per call, test after each batch, SHORT report immediately on completion, and run `npm run check` before reporting.
