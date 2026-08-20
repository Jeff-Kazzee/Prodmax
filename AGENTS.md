# Prodmax — Project AGENTS.md

Prodmax is an AI-native issues + docs workspace (original Linear/Notion
alternative). Stack: Astro 5 SSR host + single React island SPA, Tailwind +
shadcn/ui, dither-kit, canvasui, SQLite via Drizzle + better-sqlite3, SSE live
sync, keyless-first deterministic AI. Dark theme default. Brand: "the workshop,
not the office."

## Canonical docs (read before working in a module)

- `planning/architecture.md` — binding: data model, API surface, filter DSL,
  SSE events, AI interface, permissions, module boundaries §8, perf budgets §9
- `planning/design/ux-spec.md` — binding: routes, screens, keyboard map,
  AI interaction patterns, motion
- `planning/design/design-system.md` — binding: tokens, components, a11y
- `planning/research/feature-matrix.md` — feature tiers (Must/Should/Stretch)
- `planning/plans/build-prodmax.md` — the approved build plan
- `planning/tickets/` — **the work queue**: T-001…T-021, one self-contained
  ticket per module brief, with claim/verify rules in `planning/tickets/README.md`
- `planning/qa/acceptance-tests.md` — AT-001…119 (exit gate)
- `planning/handoffs/2026-08-20-t007-ready.md` — current pickup brief
  (git, next ticket, allowed gaps, how to report a gate). Older files in that
  folder are superseded.

## Working from tickets (default way to build)

Any agent (orchestrator subagent, standalone session, human-driven) picks the
lowest-numbered `status: open` ticket in `planning/tickets/` whose
dependencies are `done`, and follows `planning/tickets/README.md` — it carries
the binding shell rules (apostrophe path, subst drives, port/PID discipline),
the anti-stall rules, the four-gate definition of done, and the commit/claim
protocol. Tickets reference spec sections instead of restating them; the
specs stay binding.

## Validation commands (single source of truth)

```
npm run dev        # dev server (http://localhost:4321)
npm run check      # astro check + tsc, zero errors
npm test           # vitest run, zero failures
npm run e2e        # playwright (requires build first: npm run build && npm run preview)
npm run build      # production build, zero errors
```

All four of check/test/e2e/build must be green before any module is called done.

## Conventions

- TypeScript strict; no `any` without a comment justifying it.
- API: Astro endpoints under `src/pages/api/**`, zod-validated, error shape
  `{error:{code,message,details}}` (architecture §3).
- Every DB query workspace-scoped (architecture §7); better-sqlite3 sync calls
  in service layer only.
- React island code under `src/island/**`; shared types under `src/lib/types`.
- Component naming per design-system (§6); tokens via CSS vars, never raw hex.
- Commits: conventional, atomic per module or fix (`feat(issues): …`,
  `fix(auth): …`). Never commit `data/` (runtime SQLite file) or `.env`.
- **Branches:** `dev` is the integration branch (GitHub default). Every
  ticket or fix opens a feature branch from `dev` (`feat/t-003-issue-views`,
  `fix/undo-tokens-schema`, …). Atomic commits land on the feature branch;
  open a PR **into `dev` only**. Do not commit directly to `dev` or `prod`.
  `prod` is the finished product — promote `dev` → `prod` only when Jeff
  explicitly asks to release. `main` is historical; do not land new work
  there.
- No placeholder controls: every shipped UI element is wired to real behavior.
