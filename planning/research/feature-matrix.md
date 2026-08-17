# Prodmax Feature Matrix — Canonical Scope Contract

**Doc owner:** consolidation agent | **Date:** 2026-08-16 | **Status:** APPROVED SCOPE — gates Phase 2 (UX), Phase 3 (build M0–M10), Phase 4 (verification)
**Inputs:** `linear-deep-dive.md` (R1), `notion-deep-dive.md` (R2), `ai-native-patterns.md` (R3), locked owner stack decisions.
**Companion docs:** `planning/architecture.md` (system design), `planning/qa/acceptance-tests.md` (AT-NNN tests this matrix points at).

**Tier definitions**
- **Must** — the full Prodmax product requires it; built inside M0–M10 without heroics. Every Must has ≥1 acceptance test.
- **Should** — built after its module's Must set if effort allows, or in a later module pass; not required for "complete core" verdict.
- **Stretch** — explicitly deferred; not planned in M0–M10.

**Parity source** = incumbent behavior this matches (per research docs). **Prodmax improvement** = explicit counter to a researched weakness, or "parity only".

**Identifier scheme** default: team key `PRO` + per-team counter, e.g. `PRO-123`.

---

## A. Platform, Auth & Security

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-001 | Account registration & login (email+password, validation, duplicate-email rejection) | Must | Linear/Notion standard account auth | Local accounts by design — no SSO paywall (Linear gates SSO to Enterprise; Notion to Business) | AT-001, AT-002, AT-003 |
| FM-002 | Session & account security management (HTTP-only cookies, expiry, logout, logout-all-devices, password change) | Must | Linear session management; Notion log-out-everywhere | Parity only (correctness focus); session list exposed to the user (neither incumbent shows device list) | AT-004, AT-005, AT-104 |
| FM-003 | Request hardening: CSRF tokens on all mutations, login/registration rate limits, scrypt password hashing, generic auth errors | Must | Standard for both incumbents' web apps | Parity only; documented and adversarially tested (Phase 4 security agent) | AT-003, AT-100, AT-105 |

## B. Onboarding

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-004 | First-run onboarding wizard: account → workspace name/slug → default team → workflow defaults → optional sample issues/docs; keyboard hints surfaced in-context | Must | Linear's praised "clean UI / ease of onboarding"; Notion template-driven setup | Counters Notion's documented learning curve ("works best if you adapt to Notion's structure"): wizard pre-creates a working workspace with sample data and an interactive shortcuts tour; also counters Linear free-tier resentment by seeding unlimited issues | AT-008, AT-009 |

## C. Workspaces, Members, Roles

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-005 | Multi-workspace membership per user; workspace switcher; per-workspace navigation state | Must | Linear workspace switcher; Notion multi-workspace accounts | Parity only | AT-010, AT-095 |
| FM-006 | Role system: owner / admin / member / guest with a single enforced capability matrix; guests are team-scoped (see only their teams' issues; no Docs access in v1) | Must | Linear roles (owner/admin/member/guest); Notion workspace roles | Counters Linear gating guests to Business tier and billing them as members — in Prodmax guests exist on every install, free of any metering | AT-011, AT-012, AT-095, AT-096, AT-097 |
| FM-007 | Member invitations: email-tagged invite with link+code token, pre-assigned role (guest invites bind to a team), expiry, revoke, re-send | Must | Linear invites; Notion member invites | Counters Notion's silently-failing guest invites (auto-converts to member invite): Prodmax shows explicit invite state (pending/accepted/expired/revoked) in UI | AT-013 |
| FM-008 | Member administration: change role, suspend (read-only, history preserved), remove, transfer ownership, admin-set password reset | Must | Linear member admin; Notion member management | Parity + admin-initiated password reset replaces email-based reset (self-hosted installs may lack SMTP; email-token reset is a documented roadmap item, not Stretch-scoped here) | AT-014, AT-015, AT-016 |

## D. Teams & Workflow

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-009 | Teams CRUD, team settings (timezone, key/identifier prefix, sidebar position), team membership list | Must | Linear teams (workspace → teams → issues spine) | No team-count caps of any kind (Linear Free=2, Basic=5); auto-created default team kept | AT-009, AT-011 |
| FM-010 | Team workflow states: fixed categories (Backlog, Unstarted, Started, Completed, Canceled, Triage) + custom named statuses per team; reorder within category; per-category minimum of 1; default-new-issue state configurable | Must | Linear configurable workflows with fixed categories | Parity only (Linear's opinionated category model is praised — "a feature, not a limitation"); adds always-available manual Duplicate terminal status | AT-017, AT-024 |
| FM-011 | Labels: workspace-level + team-level, colors, archive (blocks new use, keeps existing) vs delete; **Should sub-scope:** label groups (one label per group per issue) | Must (groups: Should) | Linear labels + label groups | Parity; reserved names enforced (assignee, cycle, priority, project, state, status) | AT-018, AT-025 |

## E. Issues Engine

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-012 | Issue CRUD: title + status mandatory, everything else optional; markdown description editor with live preview; quick-create modal (`C`) and full-screen editor (`V`); local draft persistence | Must | Linear issue creation (3 required fields model, drafts) | Drafts stored server-side per user (Linear's local drafts are lost on logout; sidebar Drafts expire in 6 months) | AT-019, AT-020, AT-021 |
| FM-013 | Team identifiers & numbering: `PRO-123` style, unique monotonic per-team counter, duplicate-free under concurrent creation; **Should sub-scope:** move issue between teams (new ID, old ID redirects & stays searchable, status remaps to nearest category, team labels dropped with warning) | Must (team-move: Should) | Linear identifiers + cross-team move semantics | Parity; redirect registry is first-class (Linear redirects exist; Prodmax documents & tests them explicitly) | AT-022, AT-023 |
| FM-014 | Issue properties: priority (None/Low/Medium/High/Urgent), due dates with overdue surfacing; **Should sub-scope:** estimates (opt-in per team; scales: Linear 1–5, Fibonacci, Exponential, T-shirt with point mapping; unestimated counts as 1) | Must (estimates: Should) | Linear priority + estimates | Parity only | AT-019, AT-020, AT-025 |
| FM-015 | Assignment & subscriptions: assign to anyone with team access (`A`, `I` = me); auto-subscribe on create/assign/@mention; manual subscribe/unsubscribe (`Shift+S`); subscriber list | Must | Linear assignee/subscriber rules | Parity only | AT-019, AT-064 |
| FM-016 | Relations: related / blocked by / blocking / duplicate; unlimited each way; referencing an issue in description auto-creates "related"; blocker resolution downgrades to "related"; blocking banner on blocked issues | Must | Linear issue relations incl. downgrade behavior | Parity only (behavior praised by reviewers) | AT-023 |
| FM-017 | Sub-issues: nesting, inheritance rules (team, priority, project inherit; labels don't), bulk-create by pasting lines of titles, convert checklist text to sub-issues, per-parent collapse in views | Must | Linear parent/sub-issues | Sub-issue order is global (shared), fixing Linear's per-user ordering complaint | AT-021 |
| FM-018 | Attachments: URL/link attachments on issues & comments; local file upload stored under `data/uploads/` with size cap | Should | Linear attachments (paperclip, drag-drop); Notion file blocks | Local-disk storage — no plan-gated upload caps (Linear Free 10 MB; Notion 5 MB) | AT-021 |
| FM-019 | Issue history: full activity feed (state, priority, assignee, label, relation changes) with 3-minute creation grace period; description version history viewable & restorable | Must | Linear activity feed + description history + 3-minute rule | Parity only (the grace rule is polish worth copying) | AT-024 |
| FM-020 | Trash & archive: manual archive (collapsed from views, searchable) + auto-archive window per team (completed issues); delete → 30-day trash with restore (`#`); undo (`Cmd/Ctrl+Z`) for delete/move with compensating actions | Must | Linear archive/delete/recently-deleted | Counters Linear's "no manual archive" control complaint; undo is compensating-action based (Linear's undo leaves partial state after team moves) | AT-026 |

## F. Views, Filters & Layouts

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-021 | Filter bar with typed operators (is / is not / is either of; includes any/all; before/after) across team, status, assignee, priority, label, project, cycle, milestone, due date, estimate; `F` opens, `Shift+F` clears last, `Shift+Alt+F` clears all; quick-filter by typing property names | Must | Linear filter bar + quick filters | Parity only | AT-025, AT-027 |
| FM-022 | Advanced filters: AND/OR with nested groups (max 3 layers), clickable formula editing | Should | Linear advanced filters; Notion filter groups (3-layer cap) | Parity only | AT-027 |
| FM-023 | Grouping by status/assignee/priority/label/project/cycle/team + sub-grouping (swimlanes); sticky headers; group-header count ↔ estimate toggle; hide empty groups; drag between groups applies the group's property | Must | Linear grouping/sub-grouping | Parity only | AT-028 |
| FM-024 | Ordering: status, priority, last created/updated, due date, manual (fractional-index reorder via `Alt+↑/↓`); reverse sort everywhere incl. manual | Must | Linear ordering | Manual order is **per-view** (Linear's is workspace-global — a documented irritant); reverse sort allowed in manual mode (Linear disables it); more criteria than reviewers say Linear exposes (due date, latest added) | AT-029 |
| FM-025 | Saved views: workspace & team scopes, personal layering, owner, favorites star to sidebar, shareable URL (access still enforced); display options (visible properties per row/card, wrapping) persisted per view; **Should sub-scope:** "set as default" landing view | Must (default-landing: Should) | Linear custom views + display options | Parity only | AT-030, AT-031 |
| FM-026 | Layouts: list view, board view (drag between columns mutates the property; touch devices require explicit confirm — move-sheet), table view (inline property editing, frozen ID column); `Cmd/Ctrl+B` toggles; virtualized rendering for ≥10,000 issues | Must | Linear list/board; Notion table/board | Touch-drag confirm counters Linear's accidental mobile column-moves complaint; virtualization counters Notion's lazy-load-50-rows slowness | AT-028, AT-032, AT-113 |

## G. Bulk Ops & Keyboard

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-027 | Multi-select (`X`, `Cmd/Ctrl+A`, Shift+click range, Cmd/Ctrl+click) + bulk edit via keyboard property shortcuts or context menu; bulk archive/delete/move-to-team/cycle/project; single undo for the whole bulk action | Must | Linear select-issues + bulk ops | Bulk undo is transactional (compensating actions), fixing Linear's best-effort-only undo | AT-033, AT-034 |
| FM-028 | Keyboard shortcut system: single-key issue ops (C/E/A/L/S/P/I/X/M), G-prefix nav (G I/M/E/B/D/P/T/C/V/S), O-prefix opens, `?` searchable shortcut help, Cmd/Ctrl+K everything; shortcuts never fire while composing text | Must | Linear keyboard-first UX (praised "table stakes" per R1 implication #3) | Parity only — plus in-app shortcut tutor from onboarding (FM-004) | AT-035, AT-036 |
| FM-029 | In-row property editing: change status/priority/assignee/labels directly from list/board/table rows without opening the issue | Must | Linear inline editing everywhere | Parity only | AT-036 |

## H. Cycles

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-030 | Cycle configuration & auto-creation: opt-in per team, 1–8 week length, start day, optional cooldown, up to 15 future cycles auto-created; active-cycle page (`G V`) | Must | Linear cycles | Parity only (cycles are part of the praised "lean two-level planning") | AT-038, AT-039 |
| FM-031 | Cycle scoping & rollover: add/remove issues, auto-add in-progress unassigned issues (opt-in), open issues roll to next cycle on close, completed issues movable back before cycle end | Must | Linear cycle scoping/rollover | Parity only | AT-039, AT-040 |
| FM-032 | Cycle surgery: edit future dates, end current cycle early (end of day), start next cycle today with confirmation | Should | Linear cycle surgery | Parity only | AT-041 |
| FM-033 | Velocity & capacity: per-cycle completed count/points; capacity estimate from mean of last 3 completed cycles (fallback: member count); completed-cycle stats frozen as snapshots | Should | Linear capacity dials + snapshot behavior | Snapshots are labeled "as-of" explicitly (Linear's diverging-snapshot graphs confuse users) | AT-039, AT-069 |

## I. Projects & Milestones

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-034 | Projects: cross-team issue containers, single lead, status set (Backlog/Planned/Started/Completed/Canceled), target date range at day granularity, color, project document link (brief as a Prodmax page); **Should sub-scope:** per-project custom tabs (saved views scoped to project) | Must (project tabs: Should) | Linear projects (+ project docs pattern) | Project briefs are first-class Prodmax docs beside issues — Linear bolted documents on; Prodmax's core thesis | AT-042, AT-043 |
| FM-035 | Project progress: computed from issue completion; estimate-weighted when estimates on (unestimated = 1 pt); progress shown in list & details panel | Must | Linear project progress | Progress is a materialized counter updated on issue writes (counters Notion's recompute-on-load tax) | AT-043 |
| FM-036 | Project updates: health (On track / At risk / Off track) + markdown note; reminder cadence (off/daily/weekly/biweekly) with stale-update indicator ("Update Missing" after one cycle + 3 days) | Should | Linear initiative/project updates incl. staleness signal | Updates land in the Prodmax inbox (no external Slack dependency needed) | AT-044 |
| FM-037 | Milestones: per-project, optional target date, issue membership via `Shift+M` or drag, completion % (starts counting when issues start), "next milestone" quick filter | Must | Linear milestones | Parity only | AT-045, AT-046 |

## J. Triage

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-038 | Triage inbox: opt-in per team; new issues from integrations/API/CSV land in Triage status; triage queue excluded from normal views unless explicitly filtered; `G T` navigation; optional require-priority-before-exit gate | Must | Linear triage inbox (praised "stops backlog rot") | Parity only; no Business-tier gating (Linear gates triage rules/intelligence up-tier) | AT-047 |
| FM-039 | Triage actions & keys: `1` accept (→ default status + optional comment), `2` duplicate (merge flow), `3` decline (Canceled + optional comment), `H` snooze until time-or-new-activity | Must | Linear triage keyboard flow | Parity only | AT-048 |
| FM-040 | Duplicate merge semantics: one-way from duplicate; duplicate moves to terminal Duplicate status; link-back banner on canonical; attachments transfer; merge is undoable within the session | Must | Linear duplicate as relation + reserved status | Merge undo is transactional (Linear's merge is not documented as reversible) | AT-049, AT-050 |

## K. Command Palette & Search

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-041 | Command palette (`Cmd/Ctrl+K`): searchable everything — navigation, create, property actions, view switching, settings, AI features; recent commands; keyboard-only operable | Must | Linear command menu ("if you forget any other shortcut…") | Parity only | AT-035, AT-037 |
| FM-042 | Unified global search (`/` and inside palette): FTS5 across issue titles+descriptions+comments, page titles+block text, projects, people — one consistent result set with type filters, quoted exact-match, recents | Must | Linear global search; Notion Quick Find | Counters BOTH: Notion's split behavior (workspace search ≠ database search) and its multi-second server search — Prodmax is one local index, target <100 ms at any workspace size | AT-061, AT-062 |
| FM-043 | Secondary search affordances: quick-open `O I` issue-by-title, `Cmd/Ctrl+F` filter-within-current-view (incl. inbox filter by title/ID/assignee) | Should | Linear O-prefix + in-view search | Parity only | AT-063 |

## L. Docs Editor

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-044 | Block editor with **19 block types**: paragraph, heading 1/2/3, bulleted list, numbered list, todo/checkbox, toggle, quote, callout, divider, code (with language tag), image, file, bookmark (URL card), embed, simple table, **embedded issue view**, page link; slash-menu insertion; markdown shortcuts (`#`, `-`, `1.`, `[]`, `>`, ` ``` `); inline formatting (bold/italic/strike/code/link); `@`-mentions of users, issues (`PRO-123`), and pages; block content sanitized server-side | Must | Notion block editor + 30-ish type list (trimmed to a coherent 19) | Notion's model without Notion's block bloat: paragraphs batch-fetched in one indexed query, page open never recurses (see architecture §9) | AT-051, AT-052, AT-053, AT-101 |
| FM-045 | Block operations: drag handle (⋮⋮) move up/down & drag-drop reordering, indent/outdent (structural nesting), Turn into (compatible types), duplicate, delete, copy link-to-block; every block deep-linkable | Must | Notion drag handle + turn-into | Parity only | AT-054, AT-055 |
| FM-046 | Doc-embedded live issue views: an `issue_view` block bound to a saved view (filters/group/layout) rendering a live, up-to-date issue list/board inside a page; view edits propagate to every embed | Must | Notion linked database views; Linear project tabs | Embeds are read/write (inline status/assignee edits) and always in sync via SSE — no Notion-style linked-view recomputation stall | AT-056 |
| FM-047 | Page history: automatic snapshots on save windows (~10 min of activity), version list, view & restore; unlimited retention | Should | Notion page history (7/30/90/unlimited by tier) | Counters Notion's tier-gated retention — snapshots are cheap locally, so history is unlimited on every install | AT-057 |
| FM-048 | Doc comments: comment on a block selection (inline) or the page; threads with resolve/reopen; comments surface in author's inbox | Should | Notion inline comments | Parity only | AT-058 |

## M. Page Tree & Organization

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-049 | Page tree: infinitely nestable pages, sidebar tree with expand/collapse, drag to reorder/reparent, page icons (emoji), title edit in place; tree queries are O(visible nodes) via materialized path index | Must | Notion page tree/sidebar | Counters Notion deep-tree sprawl slowness ("the tree is the bottleneck") — indexed paths, no recursive loads | AT-051, AT-059 |
| FM-050 | Page trash: delete → 30-day trash, searchable, restore; deleted-parent restores children; permanent purge after window | Must | Notion trash (30 days) | Parity only | AT-060 |
| FM-051 | Navigation aids: favorites (pin to sidebar), recents, backlinks panel on every page (auto from page mentions) | Should | Notion favorites/recents/backlinks | Parity + saved searches in sidebar (Notion lacks customizable recents) | AT-059 |

## N. Templates

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-052 | Issue templates: workspace/team scope; preset properties (team, status, priority, labels, description markdown, sub-issues); `Alt+C` template picker; template instantiate from quick-create | Must | Linear issue templates | Parity only | AT-047, AT-052 |
| FM-053 | Page templates: prebuilt block trees (meeting notes, weekly review, project brief, engineering RFC starter); instantiate from "New page" and slash menu | Must | Notion page/database templates (the praised ecosystem on-ramp) | Ships with a curated starter set + user templates (original content) | AT-052 |
| FM-054 | Recurring issues: any template (or issue) on a repeat schedule (daily/weekly/monthly); next instance created 00:01 team timezone after due; template edits don't mutate created instances | Should | Linear recurring issues; Notion repeating templates | Parity only | AT-040 |

## O. Notifications

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-055 | Notification inbox: unified in-app inbox (`G I`) for assignment, mentions (comment/description/doc), subscribed-issue changes (state/priority/comment), project updates, invites, AI suggestions; read/unread (`U`, `Alt+U` all-read), snooze (`H`), delete, unread badge; **no retention cap**; notifications generated only for users with access to the entity | Must | Linear inbox (keyboard-driven) | Counters Linear's documented complaints: no 2,000-cap (nothing silently dropped), split status-change event types (created / state-changed / completed / canceled / urgent-priority separately), and mentions to users without access warn the author instead of silently not notifying (Notion edge complaint) | AT-064, AT-065, AT-066 |
| FM-056 | Per-type notification preferences: enable/disable each event type for the in-app inbox (v1: in-app only) | Should | Linear channel toggles (coarse) | Counters Linear's "you cannot choose which events land in the Inbox" — per-type opt-out exists from day one | AT-067 |

## P. Activity

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-057 | Workspace activity log: append-only stream of user, system (rollover, auto-archive, recurring), and **AI** actions (every AI mutation/suggestion logged with engine label); filterable by actor kind, entity, member; per-issue/per-page feeds reuse the same ledger | Must | Linear activity feeds; Linear "agent actions always visible" trust pattern | AI actions carry engine label + explanation pointer (deterministic engines can show the actual matched rule/similarity — structurally more explainable than post-hoc LLM rationalizations, per R3 §9) | AT-068, AT-084 |

## Q. Insights

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-058 | Velocity & time metrics: per-team/per-cycle velocity (count + points); cycle time (start→done), lead time (create→done), triage time scatter with p25/50/75/95 markers; click a point → open the issue | Must | Linear insights measures (velocity, cycle/lead/triage time) | Velocity/time charts not tier-gated (Linear Insights is Business/Enterprise — reviewers call it "underwhelming for a premium feature"); richer than Linear's criticized visualizations via dither-kit | AT-069, AT-072 |
| FM-059 | Burn-up: cumulative created vs completed scope over time, per cycle/project, weekly/monthly granularity, include-archived toggle | Must | Linear burn-up slice | Parity only | AT-070 |
| FM-060 | Created-vs-completed: weekly/monthly created vs completed counts, backlog net-trend line | Must | Linear created-vs-completed | Parity only | AT-070 |
| FM-061 | Breakdowns & export: segment any chart by label, assignee, priority, state category, project, milestone; bar-hover breakdowns; click-through to filtered issue list; CSV export of any chart's data | Must | Linear insights interactivity + CSV export | Parity only | AT-071, AT-072 |

## R. AI Features (keyless-first: every feature fully functional offline via the deterministic engine; providers optional via env)

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-062 | Natural language → filter: controlled-vocabulary parser ("high priority bugs assigned to me updated last week") → validated filter AST rendered as chips before applying; works in filter bar & palette | Must | Linear AI filtering; Notion AI search | Deterministic grammar (no LLM needed); the parse is ALWAYS shown for confirmation — no silent wrong-query results (R3 failure-mode guard) | AT-073 |
| FM-063 | Duplicate detection on issue create: MinHash+LSH over shingles vs open+recent issues, stack-trace exact-hash for crashers; pre-create banner "Similar to PRO-142 (81%)" with side-by-side; propose-only, never auto-merge | Must | Linear similar-issue detection; Height Copilot dedupe (its best-liked feature) | Runs fully local at $0; explainable overlap score; no LLM hallucinated merge verdicts | AT-074 |
| FM-064 | Triage assist: rule engine (keywords/regex/stack-trace presence) + kNN over historically labeled issues → scored label/priority/assignee suggestions with "why" popover (matched rule, terms, similar past issues); one-click accept/reject; corrections feed the model store; suggestion-only by default | Must | Linear Triage Intelligence; Height auto-triage | Deterministic + explainable (shows the actual rule); free on every install (Linear gates to Business); autonomous application is opt-in per workspace after precision threshold — the Height lesson: suggest-first, not silent-autonomy | AT-075, AT-076 |
| FM-065 | Summarization: TextRank extractive summaries of issue threads, comment threads, project updates; every output sentence links to its source; "generated by local engine" tag | Must | Linear AI summaries; Notion AI summarize | Extractive core can only quote — structurally cannot hallucinate (R3 guard); sources one click away | AT-077 |
| FM-066 | Ask workspace: BM25 retrieval across issues/docs/comments → extractive answer sentences with citations + confidence; explicit "no confident match" fallback; engine label on every answer | Must | Notion AI Q&A; Attio Ask; Mem chat | Sub-second local answers (Notion Q&A median: 18.3 s to first token); citations are verbatim links; retrieval text quarantined as data (injection-immune without an LLM) | AT-078, AT-079 |
| FM-067 | Drafting from related issues: template engine fills spec/PRD/story sections from structured fields (labels, relations, TextRank extracts, cluster stats); proposal/diff mode — never mutates an existing doc without review; "as of" freshness stamp | Must | ChatPRD; Shortcut Korey; Linear agent drafting | Deterministic slot-filling with entity validation (every referenced assignee/project/label checked against workspace schema — unknown entities render unlinked, never auto-created, per R3 guard) | AT-080 |
| FM-068 | Related content surfacing: TF-IDF cosine similarity panel on every issue/doc (related issues, related pages) with shared-term highlights; passive (no notifications); workspace opt-out; threshold exposed | Should | Obsidian Smart Connections (proven local pattern); Notion AI blocks | Fully local, free, zero telemetry; noise-controlled (passive + threshold + decay) | AT-081 |
| FM-069 | Backlog hygiene audit: weekly deterministic digest — stale (no activity N days), unassigned, unlinked, near-duplicate clusters → itemized cleanup report; apply is itemized + fully undoable; run caps enforced | Should | Height backlog pruning; Mem proactive nudges | Deterministic heuristics, batch-apply gated on explicit itemized confirmation (Height's silent-autonomy failure mode explicitly countered) | AT-082 |
| FM-070 | Meeting/notes → issues: paste notes (or local transcription later); date/person/task regex + cue-verb patterns → action-item drafts in a review tray; "create all" or itemized approve; entities validated against member/project lists | Should | Notion AI meeting notes; Reflect action-item extraction | Deterministic extraction; unknown entities become unlinked text, never silently created (R3 hallucination guard) | AT-083 |
| FM-071 | Related-issue clustering: agglomerative clustering over TF-IDF of open issues; cluster cards with members + cohesion score + shared-term "common requirements" draft; drag to accept/reject membership; never auto-creates projects | Should | Linear Agent "group related issues" (its signature demo) | Local + editable; cohesion threshold prevents forced groupings | AT-082 |
| FM-072 | NL automation builder ("when X then Y"): constrained grammar → trigger/action DSL with validation + mandatory dry-run against recent events before enabling; loop detection + run caps | Stretch | Notion database automations; Linear agent automations | Deferred — build only after M8's event bus is proven; Notion's 3-second multi-trigger failure window documented as a trap to avoid | (none — Stretch) |
| FM-073 | Provider-routed chat ("Deep Ask"): chat surface powered by features FM-062–FM-071 locally; if an LLM provider is configured via env (BYOK), same interface routes to it with tool allowlist, token budgets, human confirmation for writes; every answer labeled local vs provider+model | Should | Linear Agent chat; Notion AI chat; Raycast BYOK | The deterministic engine is provider #0 — features never branch on engine availability; graceful degradation instead of error (R3 §7); BYOK cost control mirrors Raycast's praised pattern | AT-083 |

## S. API, Integrations & Webhooks

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-074 | Personal API keys: per-user keys, hashed at rest, prefix display (`pmx_abc1…`), scopes (read/write granularity), last-used tracking, revoke; 1,000 req/hour/key rate limit with 429 + Retry-After | Must | Linear personal API keys (5,000/hr) | Parity at conservative default; key-scoped (not user-bucket-shared like Linear) | AT-090, AT-105 |
| FM-075 | REST API v1: JSON REST over the same service layer the UI uses — issues (CRUD, bulk, relations, comments), teams/states/labels, projects/milestones, cycles, pages/blocks read; cursor pagination; `{error:{code,message,details}}` shape; API-key or session auth | Must | Linear GraphQL API; Notion REST API | REST+JSON (simpler than GraphQL for the surface area); no Notion-style 3 req/s ceiling — local-first throughput; webhook+API parity tested | AT-091, AT-092 |
| FM-076 | Webhooks: subscribe to issue/page/comment events; HMAC-SHA256 signatures; delivery log with response status, retries w/ exponential backoff (5 attempts), manual redelivery, test ping; dead-lettering after final failure | Must | Linear webhooks; Notion send-webhook automations | Full delivery ledger visible in UI (Linear requires API to inspect); replay/redelivery built-in | AT-093, AT-094 |
| FM-077 | GitHub & Slack native integrations (PR linking, channel notifications) | Stretch | Linear GitHub/Slack flagship integrations | Deferred — API+webhooks (FM-075/076) are the supported integration surface for v1 | (none — Stretch) |

## T. Import / Export

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-078 | CSV issue import & export: upload CSV → column mapping preview → dry-run report (rows, warnings, unmapped) → commit; export of any filtered view to CSV (export doubles as import template); admin-only; import batch deletable | Must | Linear CSV importer/exporter | Dry-run + mapping preview in-product (Linear's CSV is CLI-only); no import-deletion-window surprises (documented 30-day batch undo) | AT-092, AT-113 |
| FM-079 | Page export (Markdown & HTML) and Markdown import to pages | Should | Notion export/import | Clean, deterministic exports — no nested-zip mess (Notion's broken exports spawned third-party fixers) | AT-113 |

## U. Permissions & Isolation

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-080 | Workspace row-level isolation: every query workspace-scoped in the service layer (no client-supplied workspace leakage); cross-workspace object access impossible via UI and API | Must | Both incumbents' multi-tenant isolation | Explicit adversarial test suite (Phase 4 isolation agent) — Notion's permission-leak edge cases (linked-view exposure) structurally avoided: filters evaluate server-side against the viewer's scoped rows only | AT-095, AT-096, AT-097, AT-098 |
| FM-081 | Role capability enforcement: the capability matrix (architecture §7) enforced identically in UI, REST API, webhooks admin, and AI layer (AI invokes as the requesting user) | Must | Linear role enforcement (agent "operates within the invoking user's permissions") | AI features inherit the caller's role — an LLM provider can never exceed the user's capabilities (R3 least-privilege guard) | AT-011, AT-012, AT-099 |

## V. Settings & Admin

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-082 | Workspace settings: name, slug, timezone, default landing view; danger zone: workspace delete (owner-only, type-to-confirm, cascades all data) | Must | Linear/Notion workspace settings | Parity only | AT-010, AT-015 |
| FM-083 | Team settings: workflow states editor, triage toggle + default statuses, cycles config, estimates scale, auto-archive window, label management, members | Must | Linear team settings pages | Parity only | AT-017, AT-038, AT-047 |
| FM-084 | AI settings & transparency: engine status (local deterministic always-on; provider list from env with model labels), per-feature usage stats (invocations, latency, accept-rate; cost column reads $0.00 in local mode), `ai_runs` ledger browse | Must | Linear AI settings + credit dashboards; Notion usage metering | Counters Linear's opaque expiring prepaid credits — nothing to buy locally, everything measurable; engine disclosure on every artifact (nobody in the market labels engines; cheap differentiator per R3 §9) | AT-084 |

## W. Theming & Visual

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-085 | Dark / light / system theming: CSS-variable token system, instant toggle, persisted per user, no flash on reload | Must | Linear/Notion theming | Parity only | AT-110 |
| FM-086 | Responsive & touch-safe layout: desktop-first; tablet usable (sidebar collapsible); mobile no-data-loss (board drag requires confirm sheet — FM-026); minimum 360 px viewport | Must | Linear mobile-praised / Notion mobile-criticized | Touch-safety counters Linear's accidental board-drag complaint; counters Notion's "weak mobile" weakness class | AT-111, AT-112 |
| FM-087 | Signature brand visuals: dither-kit dithered avatars & charts, canvasui signature effects (used purposefully — onboarding, empty states, brand moments; never on working surfaces), shieldcn SVG badges in-app status surfaces; original Prodmax identity throughout | Must | (No incumbent parity — original brand requirement) | Original visual identity is a stated differentiator vs both incumbents' conventional UI | AT-110, AT-111 |

## X. Realtime & Presence

| ID | Feature | Tier | Parity source | Prodmax improvement | AT |
|---|---|---|---|---|---|
| FM-088 | SSE live sync: server-sent events stream (~1 s propagation) of workspace-scoped entity deltas (issues, pages/blocks, comments, notifications, activity); automatic reconnect with `Last-Event-ID` replay of missed events; heartbeat keepalive | Must | Linear synced data graph feel; Notion WebSocket pushes | Optimistic local-first UX: edits render instantly, SSE reconciles — no Notion-style saveTransaction round-trip latency on open | AT-085, AT-086, AT-087, AT-088 |
| FM-089 | Presence: avatars on issues/pages/boards showing who else is viewing (SSE presence channel, 5 s heartbeat, 15 s TTL); no ghost entries after disconnect | Must | Figma/Notion presence cues | Parity only | AT-089 |
| FM-090 | Optimistic UI & reconciliation: all mutations apply locally first, roll forward on confirm; version-checked — a stale edit (another user changed the same field) surfaces a non-destructive conflict notice rather than silently overwriting | Must | Linear optimistic sync engine | Explicit conflict surfacing (Linear silently last-writer-wins; Notion offline merges lose content — both documented complaints) | AT-086, AT-088 |

---

## Summary Counts

### By tier

| Tier | Count |
|---|---|
| Must | 71 |
| Should | 17 |
| Stretch | 2 |
| **Total** | **90** |

### By area × tier

| Area | Must | Should | Stretch | Total |
|---|---|---|---|---|
| A. Platform, Auth & Security | 3 | 0 | 0 | 3 |
| B. Onboarding | 1 | 0 | 0 | 1 |
| C. Workspaces, Members, Roles | 4 | 0 | 0 | 4 |
| D. Teams & Workflow | 3 | 0 | 0 | 3 |
| E. Issues Engine | 8 | 1 | 0 | 9 |
| F. Views, Filters & Layouts | 5 | 1 | 0 | 6 |
| G. Bulk Ops & Keyboard | 3 | 0 | 0 | 3 |
| H. Cycles | 2 | 2 | 0 | 4 |
| I. Projects & Milestones | 3 | 1 | 0 | 4 |
| J. Triage | 3 | 0 | 0 | 3 |
| K. Command Palette & Search | 2 | 1 | 0 | 3 |
| L. Docs Editor | 3 | 2 | 0 | 5 |
| M. Page Tree & Organization | 2 | 1 | 0 | 3 |
| N. Templates | 2 | 1 | 0 | 3 |
| O. Notifications | 1 | 1 | 0 | 2 |
| P. Activity | 1 | 0 | 0 | 1 |
| Q. Insights | 4 | 0 | 0 | 4 |
| R. AI Features | 6 | 5 | 1 | 12 |
| S. API, Integrations & Webhooks | 3 | 0 | 1 | 4 |
| T. Import / Export | 1 | 1 | 0 | 2 |
| U. Permissions & Isolation | 2 | 0 | 0 | 2 |
| V. Settings & Admin | 3 | 0 | 0 | 3 |
| W. Theming & Visual | 3 | 0 | 0 | 3 |
| X. Realtime & Presence | 3 | 0 | 0 | 3 |
| **Total** | **71** | **17** | **2** | **90** |

### Explicitly out of scope for v1 (roadmap notes, not commitments)

Public web publishing (Notion Sites), synced blocks, formulas/rollups DSL, page-level ACL sharing, initiatives above projects, email/SMTP flows, GitHub/Slack native integrations (Stretch FM-077), NL automation builder (Stretch FM-072), offline-first CRDT sync, agentic coding sessions.
