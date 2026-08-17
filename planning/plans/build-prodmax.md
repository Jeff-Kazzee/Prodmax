# Plan: Build Prodmax v1 (AI-native issues + docs workspace)

Owner-approved via plan mode on 2026-08-16. This document binds the build to the
canonical Phase-1/Phase-2 artifacts. Any deviation routes through a plan
amendment.

## 1. Feature description and user story

As a team, I need one fast workspace where I track issues (Linear-class: cycles,
projects, triage, views, keyboard-first) and write docs (Notion-class: block
editor, page tree, embedded issue views), with AI assistance that works fully
offline (deterministic local engine) and never mutates without review — so that
speed never degrades with scale and AI costs nothing and trusts nothing blindly.

## 2. Problem statement

Incumbents split issues and docs across tools; Notion is documented-slow at
scale (block bloat, cloud round-trips, recomputation); Linear's AI is priced
opaquely and its free tier is restrictive. No tool unifies issues + docs +
transparent local AI.

## 3. Solution statement

Prodmax: Astro 5 SSR host with a single React island SPA (React Router),
SQLite (Drizzle + better-sqlite3, WAL, FTS5) as the workspace store, SSE live
sync + presence, REST API with zod validation and workspace-scoped queries, and
a provider-agnostic AI layer whose deterministic engine (BM25/FTS5, MinHash+LSH
dedup, rule+kNN triage, TextRank, template drafting) implements every AI
feature keyless-first. Original brand: "the workshop, not the office"
(design-system.md).

## 4. Out of scope and non-goals (v1)

Per feature-matrix §out-of-scope: public web publishing, synced blocks,
formulas/rollups DSL, page-level ACL sharing, initiatives, email/SMTP flows,
native GitHub/Slack integrations, NL automation builder, offline-first CRDT
sync, agentic coding sessions. CRDT co-editing excluded — SSE last-writer-wins
per field instead.

## 5. Codebase context — canonical docs (read before any module work)

- `planning/research/feature-matrix.md` — 90 features (71 Must / 17 Should / 2 Stretch)
- `planning/architecture.md` — data model, API surface, filter DSL, SSE, AI layer, permissions, module boundaries (§8), perf budgets (§9)
- `planning/design/ux-spec.md` — 49 routes, 25 screens, keyboard map, palette, AI patterns, realtime UX, motion, copy
- `planning/design/design-system.md` — brand, tokens, 51 components, dither/canvas rules, a11y
- `planning/qa/acceptance-tests.md` — AT-001…AT-119 (the Phase-4 exit gate)

## 6. Task-by-task implementation plan

Modules M0–M10 with exclusive directory ownership exactly as architecture §8.
Order: M0 foundation → M1 data & API core → M2 shell → M3 issues → M4
projects/cycles → M5 docs → M6 AI → M7 insights → M8 realtime → M9
integrations → M10 settings/admin. One narrowly-scoped agent per module; the
orchestrator runs the integration checkpoint after each (full suite + adjacent
smoke) before the next starts.

## 7. Validation strategy

- Every module ships vitest unit/integration tests for its service-layer logic
  (targets named in acceptance-tests.md automated mappings).
- Commands (also in AGENTS.md): `npm run check` (astro check + tsc), `npm test`
  (vitest run), `npm run e2e` (playwright), `npm run build`.
- Phase 4 drives the running app via browser agents against AT-001…AT-119;
  defects log to `planning/qa/defect-log.md` with fix→retest loop until zero
  material defects.
- Exit: all 119 ATs pass, all four commands clean, README with shieldcn badges.
