# T-012 — M6a-2 AI endpoints + in-context UI

status: open
module: M6 AI layer
assignee: —
owns: src/pages/api/ai/** (deterministic endpoints only — NOT chat/conversations), src/components/ai/** (badge/banners/chips), edits to consume seams in T-003/T-004/T-009 surfaces (registered hooks only; log amendments), tests/api/ai*, tests/island/components/ai*
depends-on: T-011

> Read `planning/tickets/README.md` first. The AI DOCK and agent chat are
> T-013/T-014 — do not build them here.

## docs-to-read
- architecture.md §3.8 (endpoint list), §6.1 wrapper rule (ai_runs
  logging + result annotation + engine badge), §6.4 defenses
- ux-spec.md §8 (all patterns), §4.22 (AI center S-22 minus dock)

## Deliverables

- Endpoints: nlq, dedup/check, triage/suggest, summarize, ask, draft,
  related, hygiene/run + apply, meeting/extract, clusters, usage — every
  one wrapped: workspace scoping, ai_runs row (feature, engine
  'local-deterministic', input_hash, duration, outcome), response
  annotated {engine, engineLabel, asOf}.
- UI touchpoints per §8: NL→filter chips in the filter bar (AI-tinted,
  pending Apply/Edit/Discard); dedup banner on issue open ≥60% (diff
  side-by-side, merge/not-dup/mute, 5s undo); triage ⚡ strips with Why?
  popover; Summarize buttons (issue panel, project, cycle) with citation
  chips that scroll to source; `/ai/ask` page (R-30) with confidence bar
  + 10-turn cap + thread in localStorage; draft ghost-content diff mode
  (Accept/Discard, never auto-saves); related passive panel section on
  issue open; hygiene digest in AI Center tab + notification row; clusters
  tab; EngineBadge component everywhere AI output renders.
- AI Center screens R-27/R-28/R-29 (suggestions queue with Accept/Reject/
  Why/Dismiss + 7d expiry; runs ledger from ai_runs w/ filters; usage
  stats p50/accept-rate, $0.00 local).
- Palette "Ask the workspace" row + AI command rows (§7.3).

## Acceptance
Vitest: endpoint wrapper writes ai_runs + annotates; per-endpoint
behavior vs seeded data. RTL: chip apply/discard, dedup banner flow,
citation scroll, suggestions queue expiry. All four gates green; e2e: ask
a seeded question → cited answer + engine badge.
