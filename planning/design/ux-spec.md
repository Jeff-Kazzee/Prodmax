# Prodmax UX Specification — Canonical Interaction Spec

**Doc owner:** UX flow architect | **Date:** 2026-08-18 | **Status:** BINDING for Phase 3 build agents (M2–M10 UI work)
**Inputs:** `planning/research/feature-matrix.md` (FM-001..FM-090 scope contract), `planning/architecture.md` (data model, API, SSE, AI layer), `planning/research/linear-deep-dive.md` (§2 workflows, §5 keyboard, §13 edge behaviors).
**Scope:** All Must + Should features (88 of 90; FM-072/FM-077 are Stretch and appear only as deferred stubs). No application code — this document defines *what the UI does*, exactly, so every build agent produces the same product.

**How to read this document**
- Every interactive element is named with a stable ID (`SB-*` shell, `S-nn` screens, `K-nn` shortcuts, `R-nn` routes, `AI-nn` patterns). Build agents reference these IDs in PRs and tests.
- "Click" means primary pointer activation (Enter/Space equivalent always exists). "Cmd" = Cmd on macOS, Ctrl on Windows/Linux.
- Timing budgets are *perceived* latencies measured from input event to first painted feedback, on the reference machine (M-class laptop, Chrome). If a budget is exceeded, the specified loading state MUST appear — never a silent wait.
- Optimistic rules reference the SSE envelope and `version` fields from architecture §4–§5. Conflict behavior is defined once in §9.4 and referenced everywhere.

**Shared state tokens (used by every screen)**
| Token | Meaning |
|---|---|
| `S-list` | Loading skeleton: 12 shimmer rows, row height 36px, header bar 28px |
| `S-board` | 3 columns × 4 shimmer cards, column headers rendered immediately |
| `S-detail` | Right panel: title bar (60% width line) + 6 lines + 2 chip rows |
| `S-tree` | 8 nested shimmer rows (sidebar/docs) |
| `S-charts` | Chart axes + 8 shimmer bars (insights) |
| `E-empty` | Empty state card: dither-kit dithered illustration (allowed here per FM-087), title, one-line explainer, primary action button |
| `ERR-std` | Inline error card: "Something broke on our side." + Retry button + error code (e.g. `INTERNAL`) in 12px mono. Never a bare stack trace |

---

## 1. Design Principles

These seven principles are the tie-breakers. When a spec detail is ambiguous, build agents resolve in favor of the earliest principle that applies.

**P1 — Speed is the feature.** No full page reloads after first hydration; navigation is client-side with crossfade (§10). Every mutation renders optimistically within 16ms of input and reconciles against HTTP response + SSE patch. Perceived latency budget: 100ms for any click/keystroke response, matching the incumbent's praised bar. If we can't be fast, we say so with a visible state — never a frozen frame.

**P2 — Keyboard-complete.** Every action is reachable in ≤2 keystrokes from Home: single keys for issue ops, `G`-prefix for navigation, `O`-prefix for open-by-name, and Cmd+K palette as the universal fallback ("type what you want"). The mouse is optional, never required. Shortcuts never fire while composing text (FM-028).

**P3 — Motion explains, never decorates.** Animation has exactly three jobs: show that state changed, show *why* (causality — a card dragged to a column becomes that column's status), and give spatial continuity. All motion is tokenized (§10). Nothing animates that isn't a state change. Marketing flourish (dither, canvas effects) is quarantined to login/empty/insights moments and never touches dense working surfaces.

**P4 — AI proposes, a human disposes.** Every AI surface: (a) shows the engine badge (`local ⚡` deterministic or `provider:model`), (b) presents output as a reviewable diff/chips/extract before any write, (c) is undoable after accept, (d) logs to `ai_runs` and the AI Center, (e) expires suggestions after 7 days. The AI never mutates workspace data without an explicit human commit (FM-081, architecture §6.4). Deterministic output shows *why* (matched rule, shared terms, source sentence) — explainability is the product.

**P5 — Calm density.** Compact rows (32–36px), 13px UI type, muted borders — but generous focus states (2px ring, 2px offset) and 8px minimum hit targets scaled to 36px on touch. Information density serves scanning; whitespace serves focus. Never both reversed.

**P6 — Trustworthy realtime.** Other people's changes arrive as soft signals (highlight pulse, presence avatars, a named toast "Maya moved this to Done"), never as a jump-cut that destroys the user's context. Offline is honest: a banner states what's queued; edits survive and flush on reconnect. Conflicts on a field you're editing are surfaced, never silently overwritten (FM-090).

**P7 — Accessible by default.** WCAG 2.2 AA is floor, not goal: ARIA landmarks everywhere (§3.6), full keyboard paths per screen, visible focus always, `prefers-reduced-motion` honored (§10.5), 4.5:1 text contrast in both themes, and every color-coded property (priority, state) carries a text/icon redundancy — color is never the only signal.

---

## 2. Route Map

One React island, React Router, client-side after SSR hydration (architecture §1). All routes below are SPA routes under the Astro catch-all. Route IDs `R-01`+.

**Conventions**
- Workspace context comes from `/api/auth/session` (active workspace) — never in the URL except where noted (`?wsId=` only for multi-workspace pickers).
- Layout is a **subpath** (`/list` `/board` `/table`) on issue-bearing routes; default layout per saved view, else `list`.
- Issue panel state is a query param: `?issue=PRO-123` opens the right panel over any list route; the URL is the shareable truth.
- Filters/ordering/grouping live in the query string (`?f=<encoded filter AST>`), so every view state is shareable and restorable.
- Old identifiers after a team move redirect server-side via `issue_redirects` (architecture §2.10) — the client never guesses.

### 2.1 Auth & pre-workspace routes (no shell)

| ID | Route | Purpose | Data preload | Empty | Loading | Error |
|---|---|---|---|---|---|---|
| R-01 | `/login` | Email+password sign-in (FM-001) | none | n/a | Button spinner only (form is static) | Field-level errors; generic `AUTH_REQUIRED` message (FM-003) |
| R-02 | `/signup` | Create account (FM-001) | none | n/a | Button spinner | Inline zod errors (email taken, password <10 chars) |
| R-03 | `/forgot-password` | Recovery explainer (v1: no SMTP) | none | n/a | n/a | n/a — static content + contact-admin flow |
| R-04 | `/invite/:code` | Accept invite → membership (FM-007) | `['invite', code]` on mount | "This invite expired or was revoked" + request-new card | Center card skeleton | Invalid code → explicit expired/revoked state (never silent) |

### 2.2 Core app routes (full shell)

| ID | Route | Purpose | Data preload | Empty | Loading | Error |
|---|---|---|---|---|---|---|
| R-05 | `/onboarding` | First-run wizard (FM-004) | session, then per-step | n/a | Per-step panel fade | Step retry inline; wizard never loses entered data |
| R-06 | `/` (Home) | Personal today view: inbox digest, assigned work, cycle snapshot, AI digest | `['home']` parallel: notifications(unread,3), issues(assignee=me, active), cycles(active), pages(recents,5), ai/suggestions(count) | Each panel has its own `E-empty` | Panel-level skeletons (S-list mini ×3) | Panels fail independently with ERR-std |
| R-07 | `/inbox` | Notification inbox (FM-055) | `['notifications', {unread}]` | "You're all caught up" + dither illustration + "Browse recent" link | S-list | ERR-std + Retry |
| R-08 | `/notifications` | Alias — client redirect → `/inbox` (`?prefs=1` lands on notification settings) | — | — | — | — |
| R-09 | `/my-issues` | Preset personal view: assigned to me, grouped by status, sub-group "Focus" ordering (FM-025 preset) | `['issues', myFilter]` | "Nothing assigned to you — enjoy it." + New issue CTA | S-list | ERR-std |
| R-10 | `/issues` (+`/list` `/board` `/table`) | All issues, cross-team (FM-026) | `['issues', filterAST]` page 1 (50) | `E-empty` "No issues match" + Clear filters | S-list / S-board / S-table | ERR-std |
| R-11 | `/issue/:identifier` | Full-page issue view (deep link; panel equivalent is `?issue=`) | `['issue', id]` + history + comments page 1 | 404 card w/ redirect note if moved | S-detail full-width | ERR-std; old-ID redirect banner |
| R-12 | `/v/:viewId` | Saved view by id — canonical share URL (FM-025) | `['view', id]` then `['issues', view.filters]` | "This view's filters match nothing" | S-list then content | Deleted view → "View was deleted" + owner name |
| R-13 | `/team/:teamKey` | Redirect → team's default view (`/team/:key/all`) | `['team', key]` | — | Blank + redirect (<50ms) | Unknown team → 404 |
| R-14 | `/team/:teamKey/:view` where view ∈ `all` `active` `backlog` `t/:slug` (custom) | Team issue views incl. custom saved views (FM-025); layout subpaths apply | `['team', key]`, `['views', teamId]`, `['issues', …]` | as R-10 | S-list | as R-10 |
| R-15 | `/team/:teamKey/new` | Full-screen issue editor with URL prefill (`?title=…&priority=…`) — the shareable create link (FM-012) | team, states, labels, members | n/a (form) | Form renders instantly from cache | Unknown team 404 |
| R-16 | `/triage` | Triage inbox; `?team=` or team switcher (FM-038) | `['issues', {statusCategory: triage, team}]` + AI triage suggestions (lazy, per-card) | "Triage is empty — nice." + team toggle hint | S-list | ERR-std; triage-off team → explainer card |
| R-17 | `/projects` | Project list w/ progress bars (FM-034/035) | `['projects']` | `E-empty` "No projects yet" + New project | 8 row skeletons | ERR-std |
| R-18 | `/project/:id` | Project overview: progress, updates feed, milestones, issues tab (FM-034..037) | `['project', id]`, `['project-updates']`, `['milestones']`, `['issues', {project}]` | Per-tab empties | S-detail + S-list | ERR-std |
| R-19 | `/project/:id/board`, `/project/:id/list` | Project issue layouts | as R-18 issues | "No issues in this project" + Add | S-board / S-list | ERR-std |
| R-20 | `/cycle/current` | Active cycle of `?team=` (redirects if none) (FM-030) | `['cycles', {team, status: active}]` | "No active cycle" + Enable cycles CTA | S-board | ERR-std |
| R-21 | `/cycle/:id` | Cycle detail: board, scope chart, planning drag, cooldown view; completed cycles show frozen snapshot labeled "as of close" (FM-031/032/033) | `['cycle', id]`, `['issues', {cycle}]` | "Nothing scoped yet — drag from backlog" | S-board + chart skeleton | ERR-std |
| R-22 | `/docs` | Docs home: favorites, recents, tree, templates, backlinks entry (FM-049/051) | `['pages/tree']`, `['pages/recents']` | `E-empty` "Write your first page" + template gallery | S-tree | ERR-std |
| R-23 | `/docs/page/:id` | Page editor (FM-044..048) | `['page', id]`, `['blocks', pageId]` single query | New page: one empty paragraph block + title placeholder | Title bar + 10 block shimmer lines | ERR-std; deleted → trash restore card |
| R-24 | `/docs/page/new` | Create page (`?parent=` positions it); redirects to R-23 after id assigned | none | — | — | — |
| R-25 | `/search` | Command-bar search results page (FM-042) | `['search', q, types]` debounced 150ms | Query-shaped `E-empty` "No matches for “X”" | Result-group skeletons | ERR-std |
| R-26 | `/insights` | Charts: velocity, burn-up, created-vs-completed, breakdowns (FM-058..061) | `['insights/velocity']` etc. per visible chart | Range with no data → "Not enough history yet" per chart | S-charts | Per-chart ERR-std |
| R-27 | `/ai` | AI Center — Suggestions queue tab (FM-064/069 etc. review home) | `['ai/suggestions']` | "No suggestions awaiting review" | S-list | ERR-std |
| R-28 | `/ai/runs` | `ai_runs` ledger browser (FM-084) | `['ai/runs', filters]` | "No AI runs yet" | S-list (table variant) | ERR-std |
| R-29 | `/ai/usage` | Per-feature usage stats (FM-084) | `['ai/usage']` | zeros state w/ explainers | S-charts mini | ERR-std |
| R-30 | `/ai/ask` | Deep Ask workspace Q&A chat (FM-066/073); **shares threads with the AI dock** (§3.7) | chat history (server `agent_conversations`) | Conversation starter: 3 sample questions | Typing indicator + engine badge | Engine timeout pattern §8.13 |
| R-31 | `/archive` | Trash & archive: tabs issues/pages/projects; 30-day window, restore `#` (FM-020/050) | `['trash', tab]` | "Nothing in trash" | S-list | ERR-std |

### 2.3 Settings & admin routes (shell, admin-gated per capability matrix)

| ID | Route | Purpose | Empty/Loading/Error pattern |
|---|---|---|---|
| R-32 | `/settings/profile` | Name, avatar seed (dither avatar preview), password change (FM-002) | standard |
| R-33 | `/settings/sessions` | Active session list w/ device, IP hash, expiry; logout-all (FM-002) | "Just you" single-row state |
| R-34 | `/settings/appearance` | Theme dark/light/system, density (compact/comfortable), motion toggle (FM-085) | instant preview, no save button |
| R-35 | `/settings/notifications` | Per-type in-app toggles (FM-056) | defaults shown |
| R-36 | `/settings/members` | Roster, roles, suspend/remove, invites w/ explicit states (FM-006..008) | invite states: pending/accepted/expired/revoked chips |
| R-37 | `/settings/teams` | Team list, create, sidebar reorder | standard |
| R-38 | `/settings/teams/:teamKey` | Team detail tabs: General · Workflow · Labels · Cycles · Triage · Estimates · Auto-archive · Members (FM-009/010/083) | per-tab |
| R-39 | `/settings/workflows` | Team picker → state editor (same component as R-38 Workflow tab; exists as a direct URL for palette) | standard |
| R-40 | `/settings/labels` | Workspace labels + groups; archive vs delete (FM-011) | standard |
| R-41 | `/settings/templates` | Issue + page templates, recurrence (FM-052/053/054) | starter-set shown when empty |
| R-42 | `/settings/api-keys` | Key create (secret shown once), scopes, last-used, revoke (FM-074) | "No keys" + security note |
| R-43 | `/settings/webhooks` | Webhook CRUD, event subscription, secret rotation (FM-076) | standard |
| R-44 | `/settings/webhooks/:id` | Delivery ledger, retries, test ping, manual redeliver (FM-076) | empty ledger explainer |
| R-45 | `/settings/import-export` | CSV import wizard (map → dry-run → commit), exports (FM-078/079) | wizard pattern |
| R-46 | `/settings/workspace` | Name/slug/timezone/default landing; danger zone delete (FM-082) | type-to-confirm |
| R-47 | `/settings/ai` | Engine status, chatProvider/model/cliPath, not-installed CLI state, per-feature toggles + thresholds, autonomous-apply opt-in (FM-064/073/084) | local engine always-on card; CLI health |
| R-48 | `/admin/activity` | Workspace activity ledger: user/system/AI actors, filters (FM-057) | "No activity in range" |
| R-49 | `*` | 404 | — |

**Route count: 49** (R-08 is an alias; R-13 a redirect).

---

## 3. App Shell

### 3.0 Shared interaction contract (referenced by every screen in §4)

Stated once; §4 screens list only deviations.

| Contract | Rule |
|---|---|
| **States** | hover = `interactive-hover` fill (cards/menus additionally get `border-strong`); active/pressed = `interactive-active`; focus-visible = 2px `ring`, 2px offset, nothing else changes (design-system §10.1); disabled = `text-tertiary` text, 50%-opacity icon, hit target retained, `aria-disabled="true"` |
| **Optimistic** | Every mutation: local apply ≤16ms after input event → HTTP request → reconcile → SSE patch (version-checked, §9.4). Rollback on error with `ERR-std` toast. "Realtime" rows in §4 name only what pulses/toasts/conflicts on that screen |
| **Timing** | 100ms perceived budget per click/keystroke. Waits >400ms show a skeleton token (`S-list`/`S-board`/`S-detail`/`S-tree`/`S-charts`); waits >2s add progress copy (design-system §45); never a silent frozen frame |
| **Toasts** | Mutations that change >0 entities toast the receipt (design-system §19): result-first copy, mono meta, Undo action when an undo token exists. Bottom-right stack, max 3, danger persists 8s / others 4.5s |
| **Density** | All rows/cards/controls consume the density vars (design-system §4.2); nothing hard-codes heights |

### 3.1 Anatomy

```
┌──────────┬──────────────────────────────────────────┬──────────┬────────────┐
│ SIDEBAR  │ TOPBAR h-44 · bg-1 · hairline-b          │ AI DOCK  │ ISSUE      │
│ w-240    │ [SB-10 breadcrumb] [SB-11 view controls] │ w-400    │ PANEL      │
│ bg-1     │ [SB-19][SB-12][SB-16][SB-13 AI][SB-14]   │ 320–560  │ w-480/640  │
│ hairline │ [SB-15 + New]                            │ grid col │ overlay    │
│ -r       ├──────────────────────────────────────────┤ §3.7     │ z-panel 30 │
│          │ [SB-21 reconnect banner — only while      │ AD-01..  │            │
│ SB-01 ◰  │  reconnecting/offline — h-36 sticky]      │ AD-08    │            │
│ FAVORITES├──────────────────────────────────────────┤          │            │
│ SB-03 ★  │               CONTENT · bg-0             │          │            │
│ TEAMS    │        (reflows when dock open)          │          │            │
│ SB-05 ▸  │                                          │          │            │
│ PAGES    │                                          │          │            │
│ SB-02 ▸  │                                          │          │            │
│ SB-04 ◷  │                                          │          │            │
│ SB-20 ◰  │                                          │          │            │
└──────────┴──────────────────────────────────────────┴──────────┴────────────┘
              overlay layers (over content, above panels):
              COMMAND PALETTE · 640px centered · z-palette 40
              DIALOGS/SHEETS z-dialog 50 · TOASTS z-toast 60 · TOOLTIPS z-tooltip 70
```

- CSS grid `[sidebar | main | dock]`. The **AI dock** (§3.7) is a grid column: it **reflows** content when open. The issue panel **overlays** (never reflows) the content column, dimming nothing — density stays stable when it opens (P5). Dock and panel **coexist**: opening a panel does not close the dock; opening the dock does not close a panel.
- The Astro shell (SSR) renders topbar + sidebar + route skeleton; hydration swaps to the SPA. After first paint there are **zero full page reloads** (P1); route changes crossfade content only (§10).
- Scroll ownership: sidebar scrolls independently; content scrolls independently; panel scrolls independently. `Cmd+↑/↓` (browser default) is never intercepted; Home/End go to list ends when a list has focus (§6).

### 3.2 Left sidebar (SB-01..SB-09)

| ID | Element | Trigger → behavior |
|---|---|---|
| SB-01 | **Workspace switcher** (avatar 24 + workspace name + chevron; footer of header block) | Click/Enter → menu (Popover): my workspaces with dither avatars + role label, active check, "Create workspace…" (dialog S-23.9 pattern), "Workspace settings" (R-46). Switching: menu closes, `?wsId=` set silently, **entire client cache dropped, `resync` full refetch**, sidebar/topbar re-render, navigation state (last route per workspace) restored (FM-005). Switch <150ms perceived via parallel preloaded `['session']` workspaces list |
| SB-02 | **Pages tree** (SectionHeader "Pages" + TreeNode tree, design-system §21) | Chevron click/Enter → expand/collapse (`aria-expanded`); expanding fetches the child batch (path-indexed, <50ms; else 3-row `S-tree` mini). Alt+click a chevron expands the whole subtree. Active page = `interactive-selected` + inset bar. Drag a page: hairline drop indicator between siblings (reorder), highlight on a node (reparent; depth cap 20, cycle-detect; drop on "Pages" header = move to root). Kebab per node on hover: Rename (inline Input), New subpage, Duplicate, Copy link, Move to trash (undo toast). "+" ghost on the header = new root page; "+" ghost on node hover = new child |
| SB-03 | **Favorites** (starred views + pages + saved searches) | Drag rows to reorder (fractional position); keyboard Alt+↑/↓ on a focused row. Star toggles from view header (SB-11) and page kebab. Empty: "Star views or pages to pin them here" one-liner (not a full E-empty — reserved for content surfaces) |
| SB-04 | **Recents** (last 5 pages/views, mono relative time) | Click navigates; hover reveals dismiss ×; list rebuilds on route change; per-workspace, persisted server-side in user prefs |
| SB-05 | **Teams section** (one expandable group per team, ordered by sidebar position) | Team row expands to: All issues · Active · Backlog · [custom views, starred first] · Triage (only if enabled; mono unread count badge) · Cycle N (current, if enabled) · "+ New view". Team kebab: Team settings (R-38), Create issue (R-15), Copy team link. Unread Triage badge increments via SSE `issue.created` with triage status |
| SB-06 | **Collapse toggle** (chevron at sidebar top-right; `Cmd+\` anywhere) | Collapses to a 48px icon rail: Home, Inbox, My issues, All issues, Docs, Insights, AI — then favorites (16px icons), team dots (2-letter mono keys), pages root, user avatar. Rail icons carry Tooltip labels + SR names. Persisted in user prefs; per-device (localStorage) so a laptop rail doesn't shrink a desktop monitor. Expansion animates width 200ms `--dur-base` `--ease-standard` (a state change, P3) |
| SB-07 | **New page affordance** (header "+") | Creates the page server-side immediately (R-24 → R-23) so the URL is real before typing starts; sidebar node appears at once with "Untitled" in edit mode |
| SB-08 | **New view affordance** (team "+" and view-header Save-as) | Opens the save-view dialog (S-11 SV-03) with the current filter/layout pre-filled |
| SB-09 | **Resize handle** (right hairline edge, 4px hit 8px) | Drag 200–320px; double-click = 240 default; persisted per device. Content column absorbs the delta; <1024px the handle is disabled (rail/drawer mode instead) |

**Sidebar focus model:** the tree implements the APG Tree pattern (arrow keys within, Tab exits to topbar). `G`-prefix navigation moves real focus into the corresponding tree node or view (design-system §10.1).

### 3.3 Top bar (SB-10..SB-19)

| ID | Element | Trigger → behavior |
|---|---|---|
| SB-10 | **Breadcrumb** (workspace / team / view / `PRO-123`) | Each crumb is a link (hover underline, last crumb `text-primary`, issue crumbs mono). Overflow collapses middle crumbs to "…" (opens the full path in a Popover). Route changes update the breadcrumb before content swaps (no flash of stale title) |
| SB-11 | **View controls cluster** (left of spacer; only on issue-bearing routes) | `[Layout ▸▸]` segmented List/Board/Table toggle (`Cmd+B` cycles; ARIA radiogroup) · `Group` menu (none/status/assignee/priority/label/project/cycle/team + sub-group second level) · `Order` menu (criteria + asc/desc; manual mode shows "reorder with Alt+↑/↓" hint; reverse allowed in manual — FM-024) · `Filter` trigger (Kbd `F`) focuses the filter bar (S-10) · `Display` popover (visible properties checkboxes, wrapping toggle, sub-issues toggle, hide-empty-groups) · view identity: name, star (SB-12-style favorite), "…" (Rename, Duplicate view, Copy URL, Set as default landing [Should], Delete) |
| SB-12 | **Presence avatars** (PresenceStack, design-system §33) | Full spec §9.1. In topbar: avatars of people viewing the *current entity* (view/board/issue/page); hover → roster HoverCard; >3 collapses to "+n" chip |
| SB-13 | **AI button** (Ghost, 16px ⚡ leading glyph, label "AI") | Click **toggles the AI dock** (§3.7, `Cmd+J`). Dropdown items from the old menu are folded into the dock (Ask / current-view summarize / suggestions) and AI center (R-27). Palette command "Toggle AI dock". Never amber (AI = phosphor teal, design-system §2.7). Badge dot when suggestions await review. `aria-pressed` reflects dock open state |
| SB-14 | **Inbox bell** (IconButton) | Click → R-07. Mono unread count badge (tabular, caps at "99+"); badge increments live via SSE `notification.created` with a 150ms scale-in; clicking clears for the visible page only. SR name announces count ("Inbox, 3 unread") |
| SB-15 | **New issue** (Primary sm, plus icon, Kbd `C`) | Opens the quick-create modal (S-13). Disabled (tooltip "No team access") only for a guest with zero teams — an edge that cannot normally occur |
| SB-16 | **Search trigger** (Input-look button, placeholder "Search…", trailing Kbd `/`) | Opens the command palette in search mode (§7.4). Never a real input in the topbar — one search surface, always the palette (FM-042) |
| SB-17 | **Theme toggle** (IconButton Sun/Moon/Monitor) | Cycles light → dark → system; instant, persisted (design-system §9.2); SR name per design-system §10.6 |
| SB-18 | **Density toggle** (IconButton) | Comfortable ⇄ compact; instant; persisted; SR name per design-system §10.6 |
| SB-19 | **Sync dot** (8px dot, left of presence) | States: synced (success, still) · retrying (warning, gentle 2s pulse — the only pulsing UI element) · offline (danger) · queued (warning + mono count). Hover tooltip: "Synced · live" / "Reconnecting · 3 edits queued" / "Offline · 3 edits queued locally". Click scrolls to / opens the reconnect banner detail (SB-21) |

### 3.4 Right panel, palette, toasts, banner (slots)

- **Issue panel** (S-12): overlays content, `panel-slide` in (200ms), focus-trapped dialog; closes on Esc / close button / route change away; URL keeps `?issue=PRO-123` as shareable truth (R-10 conventions). Only one panel instance at a time; opening another issue swaps content in place (no re-slide) with a `row-pulse` on the new header. **Coexistence:** the AI dock stays open and keeps its width; the panel overlays the reflowed content, not the dock.
- **AI dock** (§3.7): right-side grid column (not an overlay). `Cmd+J` / SB-13 / palette toggle. Esc does **not** close the dock (Esc still closes palette → dialog → panel → menu → selection). Persist open/closed + width in the user's workspace navigation state.
- **Command palette** (§7): overlay centered, `palette-in`; focus trap; while open, all other shortcuts suppressed except Esc and palette keys. Includes "Toggle AI dock".
- **Toast stack** (design-system §19): bottom-right; on <768px bottom-left above the bottom-nav; max 3 visible + "n more" collapse chip.
- **Reconnect banner slot** (SB-21, design-system §47): full-width strip between topbar and content, sticky `z-sidebar`; state machine in §9.5; renders **nothing** while synced (no layout shift reserved — it pushes content 36px when it appears; the push is the signal).

### 3.5 Focus order & ARIA landmarks

**Tab order (document order):** 1) skip link "Skip to content" (first Tab stop, visually hidden until focused) → 2) `main` content (route controls in visual order) → 3) topbar left→right → 4) sidebar (top→bottom). Rationale: content-first for keyboard users; power navigation bypasses Tab entirely via `G`/`O`/palette, which move *real* focus (P2, design-system §10.1). Opening any overlay (palette/modal/panel/menu) traps focus and restores it on close.

| Landmark | Element | Label |
|---|---|---|
| `banner` | topbar | — |
| `navigation` | sidebar `<nav>` | "Workspace navigation" |
| `main` | content region | `aria-labelledby` → route title (view name / page title / "Settings") |
| `complementary` | issue panel (when open) | "Issue details" |
| `complementary` | AI dock (when open) | "AI dock" |
| `dialog` + `aria-modal` | palette, quick-create modal, dialogs, sheets | per component |
| `role=status` / `role=alert` | toasts (danger = alert), reconnect banner, sync dot text alternative | per design-system §10.3 |

A "shortcuts" button (Kbd `?`, also in sidebar footer menu) opens searchable shortcut help — reachable from every screen (FM-028).

### 3.6 Responsive behavior (FM-086)

| Breakpoint | Shell |
|---|---|
| **≥1024 desktop (full)** | Everything in §3.1–3.4 plus §3.7. Sidebar expanded by default; panel overlays; AI dock is a grid column when open |
| **768–1023 tablet (collapsed sidebar)** | Sidebar auto-collapses to the 48px rail on load (user may expand; not persisted across sessions at this width). Expanding renders the sidebar as an **overlay drawer** (`z-sidebar`, scrim, `panel-slide` from left; Esc/scrim-click closes; focus trap). Issue panel renders **full-width** over content. AI dock stays a column at min 320 if open. View controls collapse into an overflow "…" popover (Group/Order/Display move there; Layout toggle stays). Board columns scroll horizontally with 16px snap points |
| **<768 mobile (bottom-nav + sheets)** | Sidebar hidden entirely (available from "More" sheet). Topbar reduces to back-chevron + truncated title + sync dot + inbox bell. **Bottom nav** (h-56, hairline-top): Home · Inbox · **New issue** (center, accent-filled 40px circle) · Docs · More. "More" opens a bottom sheet: Projects, Cycles, Insights, AI, Triage, Settings, profile, theme. All detail surfaces (issue, filters, display, triage actions, move-sheet) render as **full-screen sheets**. **AI dock is a full-screen sheet** (not a column). Board drag never mutates on drop — long-press (250ms) opens the move-sheet with explicit property change + confirm (FM-026). Hit targets ≥36px (P5); presence stack collapses to "+n" chip |
| **360px floor** | Grid drops to single column; list rows keep ID + title + state only (other properties available in the row kebab); filter bar is a single funnel button opening a sheet. No horizontal scrolling except board columns |

### 3.7 AI dock (AD-01..AD-08)

Persistent agent-chat surface (FM-073). Primary chat UI — R-30 `/ai/ask` and the dock **share threads** (same `agent_conversations` rows). Default width 400px; resizable 320–560. Open/closed + width persist in workspace navigation state. `Cmd+J`, SB-13, and palette "Toggle AI dock" all toggle it. Code lands in T-014.

```
┌ sessions ──┬ thread ──────────────────────────────────────┐
│ AD-01      │ AD-03 engine  AD-04 About: PRO-123           │
│ • Export   │ AD-02 messages…                              │
│ • Current  │ AD-07 [Apply create issue — Undo]            │
│            │ AD-05 composer                    [AD-06 Stop]│
│            │ AD-08 resize handle (left edge)              │
└────────────┴──────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| AD-01 | **Session list** | Current user's non-archived conversations; click loads thread; "+ New" starts a conversation with current context; archive from row kebab (DELETE) |
| AD-02 | **Thread** | User/assistant/system/tool messages as markdown; streaming `chat-delta` appends to the in-flight assistant bubble; error bubble is retryable |
| AD-03 | **Engine badge** | Live provider+model (`Local engine` / `claude-code:<model>` / `codex:<model>`). Updates on degradation without leaving the thread |
| AD-04 | **Context chip** | `"About: PRO-123"` or `"About: current view"` from `agent_conversations.context`; click focuses the entity; clearing the chip sends the next turn unscoped |
| AD-05 | **Composer** | Enter sends (Shift+Enter newline). Disabled while a turn is streaming unless Stop is used. Never fires global single-key shortcuts while focused |
| AD-06 | **Stop** | Visible only while streaming; aborts the subprocess / local invoke; partial assistant text stays; `cli_session_id` remains resumable |
| AD-07 | **Proposal cards** | One card per `{method, path, body, label}`. **Apply** runs that REST call under the user session (architecture §6.5) — never a stored-request replay. Success toast with Undo when the endpoint returns an undo token |
| AD-08 | **Resize handle** | Left edge of the dock; drag 320–560; double-click resets to 400. Not present in the <768 sheet |

**Keyboard:** `Cmd+J` toggles; when dock focused: `Esc` returns focus to `main` (does not close); composer keys as AD-05. **Realtime:** chat uses the conversation SSE, not M8. **States:** skeleton session list on first open; empty thread = 3 starter prompts; `ERR-std` on send failure; "Claude Code not installed" / "Codex not installed" copy links to Settings → AI (ST-90).

---

## 4. Screen-by-Screen Interaction Specs

Screens **S-01..S-25** cover all 49 routes (multi-route screens merge their layouts per §2). Per screen: purpose → ASCII layout → elements (stable IDs; trigger → behavior) → keyboard path → realtime → states. The §3.0 state/optimistic/timing contracts apply everywhere and are not repeated.

### 4.1 S-01 — Login (R-01) · element prefix `AU-`

**Purpose:** email+password sign-in (FM-001). No shell, no SSE.

```
┌──────────────────────────────┬────────────────────────────┐
│ canvasui RetroDither hero    │ [mark 24]                  │
│ amber wash + 2 DitheredObject│ Sign in to your workshop   │
│ prisms over 32px grid        │ [ email           ]        │
│ PRODMAX (mono, top-left)     │ [ password      👁 ]       │
│                              │ [       Continue      ]    │
│ "Ship from the bench."       │ Forgot password? ·         │
│ (mono, bottom-left)          │ Create account             │
└──────────────────────────────┴────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| AU-01 | Email input | Blur/submit → zod format check; inline error `text-sm` danger + `aria-invalid`; value persists across failed attempts |
| AU-02 | Password input + show/hide `👁` | Toggle swaps type, focus retained; SR name "Show password" ⇄ "Hide password" |
| AU-03 | Continue (Primary, full-width) | Submit: spinner replaces label icon, label persists, inputs stay enabled (user can keep typing). Success → active workspace or `/onboarding` |
| AU-04 | Error slot | Failed login → field-level danger banner: "Email or password is incorrect." — generic by contract (FM-003), never reveals which field |
| AU-05 | Rate-limit state | After repeated failures: "Too many attempts. Try again in 60s." with live mono countdown; submit disabled with `aria-disabled` until it expires |
| AU-06 | Links | "Forgot password?" → R-03; "Create account" → R-02 |

**Keyboard:** autofocus email; Tab email → password → Continue → links; Enter submits from either input. **Realtime:** none. **States:** form is static (R-01); hero renders one static frame under `prefers-reduced-motion` (design-system §7.2).

### 4.2 S-02 — Signup (R-02) · `AU-` (cont.)

Same split layout. Fields: Name, Email, Password.

| ID | Element | Trigger → behavior |
|---|---|---|
| AU-10 | Name input | Required; inline error if empty on submit |
| AU-11 | Password + live requirement list | Checklist under the field: "10+ characters" — check mark flips success as criteria are met while typing (instant, no submit needed) |
| AU-12 | Create account (Primary) | Spinner-in-label; on `VALIDATION` duplicate-email detail → inline "That email already has an account." + "Sign in instead" link (email case-insensitive, architecture §2.1) |
| AU-13 | Post-create | Session created server-side → redirect `/onboarding` (S-05); no intermediate confirmation screen |

**Keyboard:** as S-01. **States:** button spinner only; inline zod errors otherwise.

### 4.3 S-03 — Forgot password (R-03) · `AU-` (cont.)

Static explainer card (no form — v1 has no SMTP, FM-008): "Password resets are handled by your workspace admin." Steps listed (admin → Settings → Members → Reset password), "Back to sign in" ghost. No loading/error states by design; copy is final (CP-05).

### 4.4 S-04 — Accept invite (R-04) · `AU-` (cont.)

| ID | Element | Trigger → behavior |
|---|---|---|
| AU-20 | Invite card | Resolves `code` on mount (center card skeleton). Valid: workspace name, role label, bound team (guest invites show "Access: Core team only"), Accept (Primary) → membership + session switch into workspace. `NOT_FOUND`/expired → explicit card "This invite expired or was revoked." + "Ask for a new one" copy (never silent, FM-007). Revoked ≠ expired wording (CP-06) |
| AU-21 | Accept button | Spinner; logged-in users with another session: accepts into that account and switches workspace focus |

### 4.5 S-05 — Onboarding wizard (R-05) · `ON-`

**Purpose:** account → workspace → team → invite → sample data (FM-004). Full choreography, copy, and timings in **§12**; structure here.

```
┌────────────┬──────────────────────────────────────────────┐
│ STEPPER    │ 01 Name your workspace                       │
│ 01 ✓ Workspace│ [ Acme Fabrication              ]         │
│ 02 ● Team  │   (DecryptReveal preview plate on Continue)  │
│ 03 ○ Invite│                               [Back][Continue]│
│ 04 ○ Data  │                                              │
└────────────┴──────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| ON-01 | Stepper rail (design-system §48) | Click/`G`-free navigation to any *completed* step; active = accent bar + `aria-current="step"`; Enter in any input = Continue |
| ON-02 | Slug preview (step 1) | Live mono slug under the name input; collision → auto-suffix `-2`; editable before Continue |
| ON-03 | Team key input (step 2) | 2–6 char uppercase, live identifier preview `ENG-1`; invalid chars rejected at keystroke with inline hint |
| ON-04 | Invite rows (step 3) | Email tag input + role Select + team Select (guest) → "Create invite" → row with explicit state chip (pending) + Copy link; skip-able ("I'll invite later") |
| ON-05 | Sample data choice (step 4) | Three radio cards: **Sample workspace** (seeded team/issues/docs, FM-004) / **Start empty** / **Import CSV** (→ S-23.8 wizard). ProgressBar with dither-fill while seeding; then "Take the tour" CTA + instant-search demo (§12.4) |
| ON-06 | Shortcut tour | 5-spot coach marks (Esc-cancellable, progress dots); spots: palette, `C`, `J/K`+`X`, filter `F`, `G` nav |

### 4.6 S-06 — Home / inbox home (R-06) · `HM-`

**Purpose:** personal "today" digest — the default landing (unless a saved view is set as default, FM-025 Should).

```
┌───────────────────────────────────────────────────────────────┐
│ Good afternoon, Maya · Thu Aug 16      [Cycle 14 · day 6/10 ▸]│
├──────────────────────────────────┬────────────────────────────┤
│ INBOX DIGEST            3 unread │ MY WORK · 7 assigned       │
│  ● Maya assigned you PRO-141  2h │  ▾ Started (3)             │
│  ● Ana commented PRO-131      5h│    PRO-141 Fix dither …    │
│  ● AI: 4 triage suggestions   1d│  ▸ Todo (4)                │
│  [Open inbox  ⏎ G I]            │  ▸ Unstarted (0)           │
├──────────────────────────────────┼────────────────────────────┤
│ AI DIGEST ⚡ local      [review] │ RECENT PAGES               │
│  6 stale · 2 unassigned · 1 dupe │  📙 Weekly review · 2d     │
│  cluster (PRO-120/131)           │  📘 API notes · 5d …       │
├──────────────────────────────────┴────────────────────────────┤
│ [ + New issue C ] [ + New page ] [ Import CSV… (admin) ]      │
└────────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| HM-01 | Greeting header | Name, weekday, active-cycle chip (days remaining mono) → click navigates R-20 |
| HM-02 | Inbox digest panel | Top 3 unread notifications (split event-type icons per FM-055); click opens the entity (panel/route) and marks read optimistically; "Open inbox" ghost → R-07; unread count badge live via SSE |
| HM-03 | My work panel | Mini issue rows grouped Started/Unstarted/Backlog category; inline property edits active (FM-029); row click → panel; empty: "Nothing assigned to you — enjoy it." + New issue CTA |
| HM-04 | Cycle snapshot | Cycle N, ProgressBar (43), scoped/completed counts mono, points if estimates on; click → R-20 |
| HM-05 | AI digest card | Weekly hygiene digest (AI-08): EngineBadge + as-of mono + top items with counts; "Review" → R-27 queue filtered to hygiene; Dismiss (ghost) hides until next weekly run; card absent when no digest exists |
| HM-06 | Suggestions chip | "n AI suggestions awaiting review" → R-27 (same data as SB-13 badge) |
| HM-07 | Recent pages | 5 rows: icon + title + relative time → R-23 |
| HM-08 | Quick actions row | New issue (S-13), New page (R-24), Import CSV → S-23.8 (admins only) |

**Keyboard:** panels follow Tab order; `J/K` walks every interactive row in reading order; Enter activates; `G I` / `G M` jump from the panel headers. **Realtime:** unread badge ticks; My work rows reconcile with `row-pulse`; cycle progress bar advances on completed-issue SSE events (no animation on the bar — it jumps, P3). **States:** each panel independently `S-list`-mini → content → `E-empty` or per-panel `ERR-std` with Retry (R-06 contract).

### 4.7 S-07 — Issue list view (R-10/R-12/R-14/R-19 layouts) · `L-`

**Purpose:** the primary working surface (FM-021..027, FM-029).

```
┌ S-10 FILTER BAR (sticky, z-sticky) ─────────────────────────────┐
│ [uvent] [Team is PRO ×] [Priority is High ×] [+ Filter F]  n=42 │
├─────────────────────────────────────────────────────────────────┤
│ ▾ ● In Progress                       12 · 21 pts      [⇄ count]│
│   ☐ ▮▮ PRO-101  Fix login race on refresh      [bug] ◰ Maya  2h │
│   ☐ ▮▮ PRO-098  Blocker: dither fill … ⚠ PRO-31 [bug]     ·  1d │
│ ▸ ○ Todo                                          30 · 33 pts  │
│ ▸ ● Backlog                                       77 · 90 pts  │
│                                    [ + New issue in this group ]│
├─────────────────────────────────────────────────────────────────┤
│        [ 3 selected · Status · Assignee · … · Archive · ✕ ]     │
└─────────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| L-01 | **Group header** (sticky) | Chevron collapse/expand (state persists per view); count ⇄ estimate-points mono toggle (tabular); drag a row onto the header applies the group's property to it (with undo toast); Enter/Space toggles when focused; "hide empty groups" respects it |
| L-02 | **IssueRow** (design-system §25) | Click row → opens issue panel (`?issue=`, S-12) without leaving the list; row focus is preserved (Enter re-opens; Esc returns focus to the row). Double-click title → inline borderless Input (Enter commits, Esc reverts, blur commits). Hover: `bg-3` full-bleed + kebab + (manual order) drag handle |
| L-03 | **Inline property editors** (FM-029) | State cell → Select popover (categorized, dot+name); assignee → Combobox (avatars, "Assign to me" pinned); priority → 5-option grid picker **with text labels** (no silent cycling); labels → multi Combobox (group-aware, one-per-group enforced live); due → DatePicker with presets. All optimistic (§3.0); dirty cell shows 2px accent-300 bottom bar until reconciled |
| L-04 | **Selection** | Checkbox gutter on hover/focus-within; `X` toggles; Shift+click range; Cmd/Ctrl+click add; Cmd/Ctrl+A all; selected = `interactive-selected` + inset bar; selection persists across pagination and SSE inserts (row ids tracked) |
| L-05 | **Bulk action bar** (floating, bottom-center; appears when n≥1) | Mono "n selected" + pickers: Status `S` · Assignee `A` · Labels `L` · Priority `P` · Project `Shift+P` · Cycle `Shift+C` · Move to team · Archive · Delete (danger). Actions issue one bulk call (architecture §3.4) → **single transactional Undo toast** (FM-027): "Moved 3 issues to Done — Undo". Esc clears selection; bar collapses 120ms |
| L-06 | **Row context menu** (right-click/kebab; touch: long-press → bottom sheet) | Open · Open full page · Copy ID `Cmd+.` · Copy URL · Copy branch name · Edit title `E` · Assign to me `I` · Subscribe `Shift+S` · Add to cycle `Shift+C` · Add to project `Shift+P` · Move to team… (warning dialog: new ID, dropped team labels — FM-013 Should) · Archive · Delete `Cmd+Del` |
| L-07 | **Manual reorder** | Drag handle (visible on hover, manual order only) with 2px accent drop line between rows; `Alt+↑/↓` one step, `Alt+Shift+↑/↓` to ends (FM-024). Order is per-view; reverse sort permitted in manual mode |
| L-08 | **Sub-issue expander** | Chevron on rows with children; children render indented 20px with a 1px hairline guide; collapse state is **global** (shared order/state, FM-017); child count mono badge |
| L-09 | **Group create affordance** | "+" ghost at each group's end → quick-create modal (S-13) with the group's property prefilled |
| L-10 | **Virtualization & paging** | Rows virtualized ≥500 items (16ms/frame, architecture §9); cursor sentinel auto-fetches next 50 near scroll end; footer mono "1–50 of 12,431" live-updates on SSE inserts |
| L-11 | **Blocking indicator** | Inline relation glyph + "Blocked by `PRO-31`" link (danger glyph) directly in the title cell (FM-016) |
| L-12 | **Overdue due date** | Danger text + mono "3d late"; sorted-overdue rows surface in My work panel too |
| L-13 | **Layout toggle** | `Cmd+B` cycles list → board → table; per-view persisted (R-02 conventions) |
| L-14 | **Empty states** | Zero issues at all: `E-empty` "The bench is clear." + New issue CTA. Filters match nothing: `E-empty` "No issues match these filters" + **Clear filters** button (`Shift+Alt+F`) |

**Keyboard:** §6.2 complete list path; single-key property ops (`S/A/L/P/E/I`…), `G`/`O` nav, palette fallback. **Realtime:** `issue.updated` → row field patch + `row-pulse`; `issue.created` matching filter → insert in position (group count ticks, tabular digits prevent layout jitter); `issue.deleted` → 120ms fade-out then remove; other users' property edits on-screen reconcile silently with the pulse — no toasts in lists (P6; toasts reserved for §9.3 viewed-entity changes). **States:** `S-list` (12 rows + header) → content → `E-empty` / `ERR-std` + Retry (refetch page 1, keep filters).

### 4.8 S-08 — Board view (R-10/R-14/R-19/R-21 `board` subpaths) · `B-`

**Purpose:** status (or group-by property) workflow surface. Drag = **explicit property change + undo**, never a silent move (FM-026).

```
┌ group-by: Status ▾ ────────────────────────────────────────────┐
│ ● Backlog      ○ Todo        ● In Progress   ● Done            │
│ (7 · 9 pts)    (30)          (12 · 21)       (44)          [+]│
│ ┌───────────┐ ┌───────────┐ ┌───────────┐  ┌───────────┐      │
│ │PRO-77     │ │PRO-31     │ │▮▮ PRO-101 │  │✓ PRO-12  │      │
│ │Dither fill│ │Login race │ │  ⚠ PRO-31 │  │Ship marks│      │
│ │[bug] ◰ 2pt│ │[bug]   2h │ │[bug] ◰ Maya│  │          │      │
│ └───────────┘ └───────────┘ └───────────┘  └───────────┘      │
│  Drop issues here (empty column affordance)                    │
└────────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| B-01 | **BoardCard** (design-system §26) | Hover = `card-lift`; click → issue panel; drag ghost = 80% opacity + `shadow-4`; title 2-line clamp; footer: priority bars + ≤2 label chips (+n) + avatar + estimate dots |
| B-02 | **BoardColumn** (design-system §27) | Sticky header: state dot + name + count⇄points mono toggle + kebab (Collapse, Add issue, Hide empty columns). Columns horizontally scrollable, snap points at 16px, `border-l` hairline separators ("bays") |
| B-03 | **Desktop drag = property change** | Pointer drag: source card lifts (`card-lift` + ghost), candidate column edges highlight `accent-50%`, 2px accent drop line between target neighbors. **On drop**: PATCH state (or the grouped property) → card re-homes with `ease-spring` settle (200ms) → toast "Moved `PRO-101` to In Progress — **Undo**" (4.5s, undo token). Drag out of the board into a group header of another view is not supported (no cross-view drags in v1) |
| B-04 | **Touch drag = confirm sheet** (FM-026) | Long-press 250ms (haptic where available) → card lifts → drop highlights target column → **release opens the move-sheet**: "Move `PRO-101` to **In Progress**?" [Move · Cancel] + compact status list with counts for one-tap correction. No mutation before confirm |
| B-05 | **Keyboard column ops** | `J/K` next/prev card, `←/→` column to column, `Enter` open panel, `X` select (multi-select across columns enables the bulk bar L-05), `Shift+←/→` moves the focused card one column in the team's workflow order (same PATCH + undo toast as B-03) |
| B-06 | **Add card in column** | Column "+" → quick-create (S-13) with the column's state prefilled |
| B-07 | **Empty column** | "Drop issues here" ghost text at 24px inset (never a zero-height column — the target must exist) |
| B-08 | **WIP signal** (optional per team) | Column header warning dot + tooltip "12 open · WIP limit 10" when configured — advisory, never blocks a drop |

**Keyboard:** §6.4. **Realtime:** another user's move → card animates from old column to new (300ms translate, causality per P3) only if the source column is visible; otherwise it simply appears with `row-pulse`. Count ticks tabular. **States:** `S-board` (3×4 cards, headers immediate); empty board `E-empty` "Nothing on the board" + New issue; `ERR-std` per board.

### 4.9 S-09 — Table view (same routes, `table` subpath) · `T-`

**Purpose:** dense property editing at 10k-issue scale (FM-026).

```
┌─────────────────────────────────────────────────────────────────┐
│ ID ▸   Title             Status   Assignee  Priority  Labels  Due│
│ (frozen)                                                              │
│ PRO-101 Fix login race   In Prog ▾ ◰ Maya ▾  ▮▮ High ▾ [bug] ✎ Aug 18│
│ PRO-098 Blocker: …       Todo   ▾ —      ▾  ▮▮ High ▾ [bug] ✎  —  │
└─────────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| T-01 | **Frozen ID column** | Sticky left, mono, always visible; click = copy ID; row click (title cell) = open panel |
| T-02 | **Inline cell editors** (design-system §31) | Cell focus (click/Tab/arrows per APG Grid) = `border-strong` inset + type-specific popover (Select / Combobox / priority grid / DatePicker / estimate stepper). Enter commits · Esc reverts · Tab commits and moves right · Shift+Tab left. Optimistic; dirty cell = 2px accent-300 bottom bar until reconcile |
| T-03 | **Column visibility** | Header kebab → checkbox list (per-view display options, S-11); drag headers to reorder; sort by header click (asc → desc → off) with mono ▲▼ indicator |
| T-04 | **Row selection** | Gutter checkbox as in L-04; bulk bar L-05 applies |
| T-05 | **Virtualization** | Same engine as L-10; frozen columns use transform-free sticky positioning to keep the 16ms/frame budget (architecture §9) |

**Keyboard:** §6.3 grid pattern — arrows roam cells, `Enter` edits, `F2`-less (Enter is the only edit key), `Esc` exits edit to cell. **Realtime:** as S-07; edited-by-other-user cells update + pulse unless the cell itself is focused (then §9.4 conflict policy). **States:** `S-table` (12 shimmer rows, headers immediate); empty/error as S-07.

### 4.10 S-10 — Filter bar (component on all issue-bearing routes) · `FB-`

**Purpose:** typed filtering for 13 properties + AI NL entry (FM-021/022, FM-062). Sticky `z-sticky`, h-40.

```
[uvent] [ Team   is      PRO    ×][ Priority is-either-of  High Urgent ×] [+ Filter]  ⚡  42 issues
```

| ID | Element | Trigger → behavior |
|---|---|---|
| FB-01 | **Chip anatomy** | `property` (text-secondary) + operator (mono `is` / `is not` / `is either of` / `includes any/all` / `before` / `after` / `within last`) + value pill(s) + remove ×. Click any chip segment to edit it in place (operator menu adapts to the property's type). Chips horizontally scrollable; overflow shows mono "+n" expander |
| FB-02 | **+ Filter / `F`** | Opens property list (typed quick-filter: typing a property name filters the list — "team", "high", usernames, label names, "active cycle", "N days" all match, FM-021); choosing property → operator → value combobox, all keyboard-complete. `Shift+F` removes the last chip; `Shift+Alt+F` clears all (with undo-able toast "Cleared 3 filters — Undo" restoring the exact AST) |
| FB-03 | **Advanced mode** (Should, FM-022) | Toggle on the "+ Filter" menu → formula editor: nested AND/OR groups, ≤3 depth, click any group's combinator to flip and/or, `not` toggle per group; the formula renders as editable nested chip chrome (never raw JSON) |
| FB-04 | **AI NL entry** | Trailing ⚡ AI button (phosphor teal, `ai-solid`) → input replaces chip row: type "high priority bugs assigned to me updated last week" → on submit (Enter): parse renders as **AI-tinted chips with ⚡** (never auto-applied) → Apply / Edit / Discard (full pattern AI-01). Input placeholder: "Describe what you want to see" |
| FB-05 | **Result count** | Trailing mono "42 issues" (tabular); live on every AST change; clicking it focuses the list's first row |
| FB-06 | **URL round-trip** | Every AST change writes `?f=<encoded>` (R-02 conventions); paste-back restores exactly, including advanced groups |

**Keyboard:** `F` focus bar → arrows walk chips → Enter edits chip → Backspace on chip removes it → Esc returns to list. **Realtime:** none (client-side state); value comboboxes (assignees, labels, projects) refresh from cache on SSE. **States:** no matches → count shows "0 issues" + L-14 empty view (bar itself never errors).

### 4.11 S-11 — Saved views (R-12 + view management everywhere) · `SV-`

**Purpose:** name, persist, share, and favorite filter/layout combinations (FM-025).

| ID | Element | Trigger → behavior |
|---|---|---|
| SV-01 | **View identity in SB-11** | Current view name + star + "…" menu; unsaved changes (filters/layout/group/order/display diffs) show a dot on the name and "Save changes to view" in the menu |
| SV-02 | **Save-as dialog** (`Alt+V` original chord; also menu item) | Fields: Name · Scope (Workspace / Team / Project — capability-gated per architecture §7) · Layout default · Favorite toggle. Creates R-12 URL |
| SV-03 | **Share** | "Copy URL" copies `/v/<id>`; opening enforces access (owner + admins edit; everyone in scope views). Toast: "View link copied" |
| SV-04 | **Favorites** | Star → sidebar Favorites section (SB-03), reorderable; unstar removes from sidebar only (view persists) |
| SV-05 | **Personal display layering** | Display options saved per user (`view_user_prefs`) over the view's shared definition; "Reset to view default" in Display popover |
| SV-06 | **Set as default landing** (Should) | View menu → "Set as my default landing"; replaces Home for that user; palette "Go home" honored |
| SV-07 | **Deleted-view landing** | Opening a deleted view: `E-empty` "This view was deleted by <owner>." + "Browse all issues" CTA (R-10 fallback) |
| SV-08 | **Live propagation** | View edits (owner/admin) push `view.updated` SSE → every browser on that view reloads it (chips refresh in place, 150ms crossfade); embedded `issue_view` blocks (S-18/ED-09) update identically (FM-046) |

**Keyboard:** `Alt+V` save-as; `O F` quick-open favorites list. **States:** `S-list` then content; deleted state above; `ERR-std`.

### 4.12 S-12 — Issue detail panel (R-11 full page; `?issue=` panel variant) · `IP-`

**Purpose:** read + edit one issue completely (FM-012..020). Panel w-480 (640 wide-flag); full-page variant w-720 centered; anatomy identical.

```
┌───────────────────────────────────────────────┐
│ PRO-141  ⧉  ◰ ◰ +2          [history] [⋯]  ✕  │  header: mono ID, copy, presence, more
│ Fix login race on refresh                      │  title (click/`E` = inline edit)
│ ● In Progress ▾  ◰ Maya ▾  ▮▮ High ▾  [bug ✎] │  property strip — every chip inline-edits
│ ☰ Project: Checkout ▾ · Cycle 14 ▾ · Due Aug 18│  (second row when wrapped)
├───────────────────────────────────────────────┤
│ [Description][Comments 4][Activity][Relations 3]│ tabs (design-system §20)
│ [Sub-issues 2][Attachments 1]                 │
│                                                │
│  (active tab body)                             │
├───────────────────────────────────────────────┤
│ [🔔 Subscribed ▾] [⚡ AI ▾]        ◰ Maya · 2h │  footer: subscribe, AI menu, updater
└───────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| IP-01 | **Identifier header** | Mono `PRO-141`; click or `Cmd+.` copies ID; hover actions: Copy ID · Copy URL (`Cmd+Shift+,`) · Copy git branch name `prodmax-141-fix-login-race-on-refresh` (`Cmd+Shift+.`). PresenceStack (who's viewing this issue) right side. "⋯" menu: Open full page · Move to team · Archive · Delete · Description history |
| IP-02 | **Title** | Click / `E` → borderless inline Input (Enter commit · Esc revert · blur commit). Optimistic; SSE patch reconciles; a concurrent remote title edit while editing → §9.4 conflict sheet |
| IP-03 | **Property strip** | Every property is an inline editor (same pickers as L-03): State (Select, grouped by category) · Assignee (Combobox; `I` = me) · Priority (labeled grid) · Labels (multi, one-per-group) · Project · Cycle · Milestone · Due (DatePicker) · Estimate (stepper/dots). Missing properties appear as ghost "+ Add" chips; keyboard `S/A/L/P/Shift+P/Shift+C/Shift+M/Shift+D/Shift+E` focus the corresponding editor |
| IP-04 | **Tabs** | Description · Comments · Activity · Relations · Sub-issues · Attachments (mono counts). `←/→` cycles when tab strip focused; each tab lazily loads on first visit (`S-detail` mini). Default tab: Description |
| IP-05 | **Description** | Markdown editor (design-system §05): toolbar B/I/S/code/link/attach + Write/Preview toggle. Edits autosave as description versions (architecture §2.3) with grace-window coalescing (FM-019); "Description history" (header menu) opens version list — view side-by-side + Restore (confirm dialog, restorable itself via undo toast) |
| IP-06 | **Comments** | Composer at top of tab (markdown, `Cmd+Enter` posts, `@` mentions with access-check warning toast if a mentioned user can't see the issue — FM-055). Threads: reply indents, resolve (`✓` SR-named) collapses to "Resolved by Maya" row, reopen available. Comment kebab: Edit (author-only) · Copy link · Convert to sub-issue · Delete. Unsent drafts persist server-side (FM-012) |
| IP-07 | **Activity** | Property-change ledger (3-minute creation grace folds early edits into "created", FM-019): "Maya moved this from Todo to In Progress · 2h ago" with actor avatars, system rows (rollover, auto-archive) and **AI rows with EngineBadge + Why pointer** (FM-057). Paged; "Load more" |
| IP-08 | **Relations** | Four groups (Related / Blocked by / Blocking / Duplicate). "+ Add relation" → issue Combobox (`O I`-style search) + type Select. Blocking banner renders at the top of the panel body when blocked: "⚠ Blocked by `PRO-31`" (danger). Blocker completing downgrades to Related and the Activity log records it (FM-016). Referencing an issue in the description auto-creates a Related row (toast informs, undoable). Duplicate group is terminal — no remove once merged |
| IP-09 | **Sub-issues** | Nested rows (global shared order, FM-017); "+ Add" → inline title input (Enter creates and chains for the next); **paste multi-line titles → bulk-create confirm** ("Create 5 sub-issues?"); "Convert checklist" action on description todo-lists; inheritance rules shown as ghost chips (team/priority/project inherit; labels don't — FM-017). Per-parent collapse persists |
| IP-10 | **Attachments** (Should, FM-018) | "+ Add link" (URL + title) and "+ Upload" (file under `data/uploads/`, progress bar per file, size-cap error inline); attachments list with kind icon, name, uploader, time; delete with undo |
| IP-11 | **Footer** | Subscribe toggle (`Shift+S`; subscriber count + roster popover), AI menu: **Summarize thread** (AI-04) · **Related content** (AI-07) · **Draft spec from issue** (AI-06) — all phosphor-teal AI buttons. Last-updated meta mono |
| IP-12 | **Panel open/close** | Opens with `panel-slide`; URL gains `?issue=PRO-141`; Esc closes and restores focus to the originating row; deep link `/issue/PRO-141` renders full-page variant (same body); old identifier → server redirect + one-time banner "Redirected from `ENG-141` — this issue moved to Core" (FM-013) |
| IP-13 | **Delete / archive** | `Cmd+Del` → confirm dialog (danger) → trash; toast "`PRO-141` moved to trash — Undo · restore with `#`" (30 days). Archive: collapses from views, stays searchable (toast notes both) |
| IP-14 | **Undo scope** | All panel mutations produce undo tokens; `Cmd+Z` inside the panel undoes the last panel action (compensating actions, FM-020) |

**Keyboard:** full path §6.2/§6.5 — panel inherits list keys when opened from a list; `Tab` order: header → title → property strip → tabs → body → footer. **Realtime:** presence in header (§9.1); "Maya is editing the description" advisory chip while another user edits (§9.2); any change to the open issue by someone else reconciles with `row-pulse` on the affected chip/tab-count and a §9.3 change toast; description conflicts follow §9.4 (never silent overwrite). **States:** `S-detail` on open (title bar 60% + 6 lines + 2 chip rows); per-tab mini-skeletons; deleted-while-open → panel body swaps to "This issue was deleted by Maya" + View in trash link; `ERR-std` per tab.

### 4.13 S-13 — New-issue modal `C` + full editor `V` (R-15) · `NI-`

**Purpose:** fastest path from thought to issue (FM-012). Modal opens centered (radius-xl, `shadow-3`); `V` swaps to the full-screen editor (880px Dialog variant, design-system §15).

```
┌ New issue ───────────────────────────────────────── ✕ ┐
│ [Core ▾]                                              │
│ Title…                                                │
│ ⚡ Similar to PRO-142 (81%) — [View side-by-side] [×] │  (AI-02, when found)
│ ▸ Add description                                    │
│ ● Todo ▾ ▮▮ None ▾ ◰ Assignee ▾ [labels ✚] ····      │  property chips
│ ☐ Create another        [Cancel] [Create issue ⌘⏎]   │
└───────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| NI-01 | **Team Select** | Defaults to last-used team (per user); changing team resets state/labels pickers to that team's; identifier preview mono "`PRO-124`" appears once title exists |
| NI-02 | **Title input** | Autofocus on open; Enter = Create (when no suggestion chosen); typing pauses >400ms trigger the dedup check (AI-02) |
| NI-03 | **Dedup banner** | AI-tinted card when candidates ≥ threshold: "Similar to `PRO-142` (81%) — 12 shared terms" + View side-by-side (opens diff of title/description) + dismiss ×. Never blocks creation (propose-only, P4) |
| NI-04 | **Description expander** | "▸ Add description" reveals markdown editor (S-12 IP-05 chrome, minus history) |
| NI-05 | **Property chips row** | State · Priority · Assignee · Labels · Project · Cycle · Milestone · Due · Estimate as ghost chips → inline pickers; only title+state required (state defaults to team default) |
| NI-06 | **Template picker** (`Alt+C`) | Opens template list (issue templates, workspace+team scope, FM-052) → instantiating fills title/description/properties/sub-issues; template chip shows provenance and can be cleared |
| NI-07 | **Create another** | Checkbox: on Create, issue is created (toast "Created `PRO-124` — Undo"), modal **stays open**, fields reset except team + `Create another` + any properties marked sticky; `Cmd+Shift+Enter` = create + carry over labels/assignee (sub-issue flow parity) |
| NI-08 | **Create** (`Cmd+Enter`) | Optimistic: modal closes (if not create-another), row appears in matching views instantly with `row-pulse`; server assigns identifier; SSE confirms. Esc closes; entered data saved as server-side draft (FM-012) — toast "Draft saved" with Resume action; reopening `C` resumes the draft |
| NI-09 | **Full editor** (`V`) | Full-screen: description Write/Preview split, sub-issue builder (paste lines = bulk), relation picker, attachment dropzone, template section; same draft persistence; `Cmd+Enter` creates |
| NI-10 | **URL prefill** (R-15) | `?title=…&priority=…&team=……` renders the modal pre-filled — the shareable create link (FM-012) |
| NI-11 | **Contextual creates** | Opened from a group header (L-09) or board column (B-06) → that property prefilled; from a parent issue's Sub-issues tab → parent linked and inheritance chips shown |

**Keyboard:** `C` open · type title · property keys (`S/P/A/L…`) without leaving the title field (picker overlays return focus to title) · `Cmd+Enter` create · `Esc` close/draft · `Alt+C` templates · `V` expand. **Realtime:** creation fans out via SSE to all matching views; duplicate-numbering impossible (sync transaction, architecture §2.10). **States:** modal renders instantly (no skeleton); template list `S-list`; dedup check ≤300ms budget else silently skipped (AI-02 failure = no banner, never an error).

### 4.14 S-14 — Triage inbox (R-16) · `TR-`

**Purpose:** intake queue for integration/API/CSV-created issues (FM-038..040). Triage issues are excluded from normal views unless explicitly filtered.

```
┌ Triage · Core ▾ (4) ────────────────────────────── require priority ✓ ┐
│ PRO-150  Crash on export CSV          source: API · 10m      [snooze]│
│ ⚡ local · Label: bug (rule: "crash" keyword) · Priority: High (kNN)  │
│    [✓ Accept 1] [⧉ Duplicate 2] [✕ Decline 3]        [Why?]         │
│ PRO-149  Question about SSO          source: CSV · 2h      [snooze]  │
└───────────────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| TR-01 | **Triage row** | Expanded card: title (click → panel), source badge (API/webhook/CSV/integration), age mono, raw description preview 2 lines; `row-pulse` on new arrivals; queue newest-first |
| TR-02 | **AI suggestion card** (AI-03) | Lazy per-card (visible cards first): EngineBadge + chip suggestions (`Label: bug ←`, `Priority: High ←`, `Assignee: Maya ←` from kNN) + **Why?** popover (matched rule name, shared terms, similar past issues w/ links). Accept-all applies suggestions then proceeds to Accept flow; individual chips accept/dismiss independently. Corrections (user picks a different label) feed the model store silently |
| TR-03 | **Accept `1`** | Moves to team default status; optional one-line comment composer appears for 5s ("Add a note for the reporter — ⏎ to skip"); row slides out 120ms; undo toast. If require-priority gate is on and priority unset → priority grid opens first and Accept resumes on selection (gate can't be bypassed — FM-038) |
| TR-04 | **Duplicate `2`** | Opens merge flow: canonical-issue Combobox (search; shows AI dedup candidates pinned first, AI-02) → side-by-side diff (title/description/attachments) → **Merge** → duplicate moves to terminal Duplicate status, attachments transfer, canonical gets link-back banner (IP-08); **undoable within the session** (transactional, FM-040) via toast "Merged into `PRO-142` — Undo" |
| TR-05 | **Decline `3`** | Status → Canceled (+ optional comment, same composer as TR-03); undo toast |
| TR-06 | **Snooze `H`** | Menu: 1 hour · Tomorrow · Next week · "Until new activity"; snoozed rows leave the queue and return automatically (banner-less; a count chip "2 snoozed" above the list re-reveals them) |
| TR-07 | **Team switcher** | `?team=` Select; teams with triage off show an explainer card "Triage is off for this team — enable it in Team settings → Triage" (link R-38) |
| TR-08 | **Empty** | `E-empty` "Triage is empty — nice." (dither tray illustration) |

**Keyboard:** `G T` arrive; `J/K` rows; `1/2/3/H` act; `X` + bulk bar for multi-accept (bulk = same action per row, one undo token); `Enter` opens the panel. **Realtime:** new triage arrivals prepend with `row-pulse` + unread badge on sidebar (SB-05); someone else triaging a row removes it locally (150ms fade). **States:** `S-list`; empty as TR-08; `ERR-std`.

### 4.15 S-15 — Project overview (R-18; R-17 list; R-19 board/list) · `PJ-`

**Purpose:** cross-team container with progress, updates, milestones (FM-034..037).

```
┌ ● Started ▾  Checkout rewrite      lead ◰ Maya   Aug 1 → Sep 12 ────┐
│ ████████████████░░░░░░░░  62% · 12/31 issues · 41/78 pts           │
│ [Overview] [Issues 31] [Milestones 3] [Updates 5]        ★ ⋯       │
├─────────────────────────────────────────────────────────────────────┤
│ MILESTONES        Next: Payments ▸ Aug 30 · 45%                     │
│ UPDATES   ● On track — "Checkout API frozen…" Maya · 3d   [Post ▸]  │
│ STATS     19 open · 12 done · 3 blocked · spark ████████            │
│ BRIEF     📘 Checkout rewrite brief  → open page                    │
└─────────────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| PJ-01 | **Header** | Status Select (5 project statuses) · Lead Combobox · Target range (DatePicker range, day granularity) · Color dot picker · Star (favorites) · "⋯" (Edit, Copy link, Archive, Delete → trash) |
| PJ-02 | **Progress** | ProgressBar (design-system §43) from materialized counter; estimate-weighted when team scales on (unestimated = 1 pt); label row mono "62% · 12/31 · 41/78 pts"; advances on SSE `issue.updated` completed patches (no animation — jumps, P3) |
| PJ-03 | **Tabs** | Overview · Issues (list/board via `Cmd+B`, same engines as S-07/S-08 scoped `project is X`) · Milestones · Updates. Project tabs (Should) add custom saved views scoped to the project after Updates |
| PJ-04 | **Milestones** | Rows: name, optional target date, completion % (starts counting when issues start — FM-037), member count; "next milestone" chip pinned first; create/edit inline; add issues from the Issues tab via `Shift+M` or drag onto a milestone row; "Next milestone" quick-filter chip (FB-01) |
| PJ-05 | **Updates feed** (Should, FM-036) | Reverse-chron cards: health chip (On track success / At risk warning / Off track danger — icon + text always), markdown body, author, progress snapshot mono. "Post update" composer: health Select + markdown + Post (`Cmd+Enter`). Stale indicator: "Update missing" warning chip when cadence elapsed + 3 days (click → lead's reminder context). Updates also land in members' inboxes (FM-055) |
| PJ-06 | **Stats row** | Open/done/blocked counts (mono) + 8-week Sparkline (design-system §42); clicking a stat applies it as a filter on the Issues tab |
| PJ-07 | **Brief** | Links the project's Prodmax page (`brief_page_id`) — opens S-18; "Create brief" offers the Project brief template (FM-053); the thesis feature: briefs are first-class docs beside issues (FM-034) |
| PJ-08 | **Empty issues tab** | "No issues in this project" + Add issues (opens Combobox search of all issues I can edit + Create new) |

**Keyboard:** `G P` → project list (R-17: rows with progress bars, `O P` quick-open); tabs `←/→`; all list keys inside Issues tab. **Realtime:** progress/counters/stats live via SSE; updates feed gets new cards with `row-pulse`. **States:** `S-detail` header + per-tab `S-list`; per-tab `E-empty`; `ERR-std` per tab; deleted project → "This project was deleted" + trash link.

### 4.16 S-16 — Cycles (R-20 current, R-21 detail) · `CY-`

**Purpose:** timeboxed planning with scoping drag, scope chart, and cooldown (FM-030..033).

```
┌ Cycle 14 · Aug 10–20 · day 6/10 · Core ▾     [⋯ surgery]  ██████ 43%┐
│ capacity est: 34 pts (mean of last 3) · scoped 41 pts ⚠ over by 7   │
├ Backlog drawer ▤ ──────────────┬─ BOARD (scoped issues) ───────────┤
│ PRO-77 Dither fill …  drag →  │ ● In Progress(5) ○ Todo(9) ▾ …     │
│ PRO-71 SSO question           │ [cards as S-08]                    │
├ SCOPE CHART (burn-up) ─────────┴────────────────────────────────────┤
│ ╱╱ scope 41 ── ▓▓ completed 12 ─ ─ ideal · week ▾                   │
└──────────────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| CY-01 | **Cycle header** | Cycle N, dates, day X/Y mono, team Select (`?team=`), progress bar, velocity stat (count + points toggle); `G V` lands here for the active cycle; cycle List (R-21 nav) via header "⋯" or `O C` |
| CY-02 | **Capacity estimate** (Should, FM-033) | Mean of last 3 completed cycles (fallback: member count, labeled "estimate from headcount"); scoped-points delta renders warning chip "over by 7 pts" (icon + text) when scoped > capacity — advisory only |
| CY-03 | **Planning drag** | Left **Backlog drawer** (toggleable panel, w-280): team's unsccoped open issues. Drag a backlog row onto the board (or onto the cycle header) → scopes it (`cycle_id` PATCH) with undo toast; drag a scoped card back to the drawer (or Del on the card → "Remove from cycle") → unsccopes. Completed issues can move back to a previous cycle **before it ends** only (guarded with toast otherwise, FM-031) |
| CY-04 | **Board** | Standard S-08 engine scoped `cycle is current`; drag-to-column behaves identically (B-03/B-04) |
| CY-05 | **Scope chart** | Burn-up AreaChart (design-system §38): scope / completed / ideal dashed; weekly granularity toggle; reads live while the cycle runs |
| CY-06 | **Surgery menu** (Should, FM-032) | "⋯": Edit future dates (DatePicker, future cycles only) · End current cycle early (confirm: "Ends today at 23:59 — open issues roll to Cycle 15") · Start next cycle today (danger-styled confirm — irreversible; rollover runs immediately). Rollover itself emits system Activity rows and `cycle.rolled` SSE (sidebar cycle chip renumbers) |
| CY-07 | **Cooldown view** | During cooldown: banner chip "Cooldown until Aug 22 — completed issues attribute to Cycle 14"; board read-only for scoping (drag disabled with tooltip why); Done moves still allowed |
| CY-08 | **Completed cycles** | Frozen snapshot: stats + chart render from `stats_snapshot`, labeled **"as of close Aug 20, 18:00"** (explicit as-of caption, FM-033 — counters Linear's diverging-snapshot confusion); live edits elsewhere never rewrite it |
| CY-09 | **Auto-add toggle** | Team setting surfaced here as a chip "Auto-add in-progress: on → Team settings"; on rollover, open issues roll forward automatically (toast + Activity rows) |
| CY-10 | **No cycles** | Team without cycles: `E-empty` "No active cycle" + "Enable cycles" CTA → R-38 Cycles tab |

**Keyboard:** `G C` cycle list · `G V` active cycle; board keys §6.4; `Shift+C` scopes the focused issue to the active cycle from any list (toast + undo). **Realtime:** scope chart and capacity chips update on scoping SSE events; two people planning simultaneously see each other's drags land with `card-lift` + pulse (presence on the cycle, §9.1). **States:** `S-board` + chart skeleton (`S-charts`); empty cycle "Nothing scoped yet — drag from backlog" + drawer auto-opens; `ERR-std` per region.

### 4.17 S-17 — Docs home (R-22) · `DH-`

**Purpose:** docs front door — favorites, recents, tree, templates (FM-049/051).

```
┌ Docs ──────────────────────────────────── [ + New page ] ┐
│ FAVORITES      RECENTS                                    │
│ ★ Handbook     📘 Weekly review · 2d   📙 API notes · 5d │
├ TREE ────────────────────────────────────────────────────┤
│ ▾ 📙 Engineering                                         │
│    ▸ 📘 API notes                                        │
│    ▸ ◇ RFC template                                     │
│ ▸ ★ Handbook                                             │
├ TEMPLATES ───────────────────────────────────────────────┤
│ [Meeting notes][Weekly review][Project brief][RFC] [All →]│
│ [Trash]                                    Guests: no Docs│
└──────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| DH-01 | **New page** | Creates immediately (R-24 → R-23); `?parent=` from a tree hover "+" positions it |
| DH-02 | **Tree** | Same engine as SB-02 (O(visible) path-indexed, FM-049) with full width: emoji icons (click → emoji picker), inline rename, drag reorder/reparent, kebab (Rename · New subpage · Duplicate · Copy link · Move to trash) |
| DH-03 | **Favorites / Recents** | Mirror SB-03/SB-04 with titles + relative time; recents dismissible |
| DH-04 | **Template gallery** | Curated starter set + user templates (FM-053); card click → preview dialog (block tree render) → "Use template" creates the page seeded with blocks |
| DH-05 | **Trash** | R-31 Pages tab (30-day restore, deleted-parent restores children — FM-050) |
| DH-06 | **Guest notice** | Guests have no Docs access (architecture §7): the route renders a single explainer card, not an error |

**Keyboard:** tree = APG Tree arrows; `Enter` opens; `N` new page (context: selected node becomes parent). **Realtime:** tree updates live as others create/rename/move pages (node insert with 150ms crossfade); presence dots on pages being edited (§9.1). **States:** `S-tree`; empty workspace "Write your first page" `E-empty` + template gallery beneath; `ERR-std`.

### 4.18 S-18 — Page editor (R-23) · `PE-`

**Purpose:** block editing surface (FM-044..048). Canvas interactions are specified exhaustively in **§5**; this screen defines the frame.

```
┌ ◁ Engineering / API notes        ◰ ◰ +1        [⋯] ─┐
│ 📘 [API notes                          ]  (title)   │
│                                                      │
│   (block canvas — §5)                                │
│   │ Basics · every block: ⋮⋮ grip, + insert          │
│                                                      │
├ RIGHT RAIL (toggle ⌘.) ──────────────────────────────┤
│ [Comments][Backlinks 3][History][Info]               │
└──────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| PE-01 | **Breadcrumb + icon + title** | Path from tree; icon click → emoji picker; title click/`T` → inline edit (title is page metadata, not a block); empty title shows "Untitled" placeholder |
| PE-02 | **Presence** | PresenceStack of editors on this page (§9.1); per-block presence: other users' cursors are **not** shown in v1 — instead "Maya is editing" advisory chips on blocks (§9.2) |
| PE-03 | **Right rail** (toggle `Cmd+.` — mirrors sidebar chord) | Tabs: **Comments** (Should, FM-048: block-scoped threads + page comments; select text → "Comment" affordance; resolve/reopen; surface in author's inbox) · **Backlinks** (auto from page mentions, FM-051; each row links to the mentioning block) · **History** (Should, FM-047: snapshot list ~10-min save windows, view + restore w/ confirm) · **Info** (creator, dates, block count mono, path) |
| PE-04 | **Page kebab "⋯"** | Export Markdown / HTML (FM-079) · Copy link · Move to trash (children included; 30-day restore) · Word count |
| PE-05 | **Deleted page** | Deep link to trashed page → restore card "This page is in the trash (23 days left)" + Restore |

**Keyboard:** §6.6 editor map. **Realtime:** blocks reconcile per-block via `block.updated` (coalesced ≤50ms, architecture §5); remote edits to the block you're editing → §9.4; page meta (title/icon/tree position) updates live. **States:** `S-tree`-derived title bar + 10 block shimmer lines; new page = one empty paragraph + title placeholder; `ERR-std`.

### 4.19 S-19 — Search (R-25 + palette mode `/`) · `SR-`

**Purpose:** one unified FTS5 result set across issues/pages/projects/comments/people (FM-042, target <100ms).

```
┌ Search ─────────────────────────────────────────────────┐
│ [ login race                                   Esc ]    │
│ [All 42][Issues 31][Pages 7][People 1][Projects 3][Comments?]│
│ ISSUES                                                  │
│  PRO-101  Fix login race on refresh   ● In Progress 2h │
│  PRO-098  …                                             │
│ PAGES                                                   │
│  📘 API notes — "…the login race guard…"               │
└─────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| SR-01 | **Input** | Debounced 150ms; mono live count "42 issues · 7 pages · 1 person"; quoted phrases → exact match; prefix `*` supported (architecture §2.10); `Esc` closes (palette mode) or clears (page mode) |
| SR-02 | **Type filter chips** | All / Issues / Pages / Projects / People — click or `⇥`-cycle in palette mode; counts mono per chip |
| SR-03 | **Grouped results** | Sections with `text-2xs` caps headers (Issues · Pages · Projects · People); issue rows = IssueRow anatomy + snippet with **matched terms highlighted** (accent-300 underline, not color-only); page rows show icon + title + block snippet; people rows = avatar + name + role + "assigned N open" |
| SR-04 | **Result activation** | Enter/click → issues open the panel (`?issue=`); pages open R-23 (deep link `?block=` when the match is a block — the snippet's block anchor); people open profile HoverCard→profile sheet; projects → R-18 |
| SR-05 | **Recents** | Empty query shows last 8 visited entities (mono timestamps) + "Type to search everything" hint |
| SR-06 | **No results** | `E-empty` "No matches for “login race”" + actions: Clear quotes · Search all types · "Create an issue titled “login race”" (original — search-to-create) |
| SR-07 | **In-view filter `Cmd+F`** (Should, FM-043) | On any list/inbox: focuses the filter bar pre-scoped to the current view (inbox filters by title/ID/assignee) — distinct from global `/` |

**Keyboard:** `/` opens palette search mode (§7.4); `O I` issue-by-title quick-open; arrows walk results; `⇥` cycles type filters; Enter opens. **Realtime:** static result set (re-run on Enter or 300ms idle after an SSE invalidation toast-free). **States:** per-group `S-list`-mini rows while debouncing beyond 150ms; no-results as SR-06; `ERR-std` with Retry.

### 4.20 S-20 — Notifications inbox (R-07; `/notifications` alias R-08) · `NB-`

**Purpose:** unified in-app notification feed (FM-055) — no retention cap, split event types.

```
┌ Inbox ──────────────────────────── [filter ⌘F] [⋯ prefs]┐
│ ● ◰ Maya assigned you PRO-141              2h   [H][✕]  │
│ ● ◰ Ana commented on PRO-131               5h   [H][✕]  │
│ ○ ◰ System archived PRO-90 (30d window)   1d            │
│ ⚡ AI: 4 triage suggestions ready (Core)   1d   [H][✕]  │
│ [mark all read ⌥U]              1–50 of 214 · Load more │
└──────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| NB-01 | **Notification row** | Split-type icons (assigned / mentioned / commented / state-changed / **completed** / **canceled** / **urgent-priority** / subscribed / project-update / invite / AI-suggestion — FM-055's split events); actor avatar; sentence (entity name links); relative time mono; unread dot ●. Click → entity opens + row marks read optimistically (undo-able read state via `U`) |
| NB-02 | **Row actions** (hover/focus) | Snooze `H` (same menu as TR-06) · Delete `Backspace` (confirm-free, undo toast) |
| NB-03 | **Read state keys** | `U` toggles focused row; `Alt+U` marks all visible read; `Shift+Backspace` deletes all read (confirm dialog with mono count) |
| NB-04 | **Filter `Cmd+F`** | Title/ID/type/assignee/team/project/priority quick-filter input (FM-043) |
| NB-05 | **Preferences** | "⋯" → per-type in-app toggles (R-35, FM-056) — 11 event types, each independent |
| NB-06 | **Paging** | Cursor "Load more"; infinite-scroll in modal-less mode; footer mono count |
| NB-07 | **Empty** | `E-empty` "You're all caught up" (dither tray) + "Browse recent activity" → R-48 |

**Keyboard:** `G I`; `J/K`; `U`/`Alt+U`; `H`; `Backspace`; `Cmd+F`. **Realtime:** new notifications prepend with `row-pulse` + topbar badge tick (SB-14); snoozed items vanish and return silently; recipient-only SSE targeting means no cross-user noise (architecture §5). **States:** `S-list`; empty as NB-07; `ERR-std`.

### 4.21 S-21 — Insights (R-26) · `IG-`

**Purpose:** velocity, burn-up, created-vs-completed, time metrics, breakdowns — not tier-gated, dither-kit rendered (FM-058..061).

```
┌ Insights · [Team ▾][Range ▾][Segment ▾]                    ─┐
│ ┌ VELOCITY (bars) ─────────┐ ┌ CREATED VS COMPLETED ──────┐ │
│ │ ▓▓ 12  ▓▓ 14  ▓▓ 9       │ │ ▓▓▓ created  ░░ completed  │ │
│ │ count ⇄ pts · C11–C14    │ │ net trend ▁▄▂ + CSV        │ │
│ ├ BURN-UP (area) ──────────┤ ├ CYCLE TIME (scatter) ──────┤ │
│ │ ╱╱ scope ─ ▓ completed   │ │ ·  ·  ·  p50 ┄ p95 ┄       │ │
│ │ week ⇄ month · incl arch │ │ click point → issue        │ │
│ └──────────────────────────┘ └────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| IG-01 | **Global controls** | Team Select · Range (DatePicker range + presets: last 4/12 weeks, quarter) · Segment (label/assignee/priority/state-category/project/milestone — FM-061). All charts re-query in parallel; each shows its own `S-charts` |
| IG-02 | **Velocity bars** (FM-058) | Grouped bars per cycle (completed count / points toggle); hover = mono value + breakdown popover; bar click → click-through to the filtered issue list (`R-10?f=…cycle+completed`) |
| IG-03 | **Burn-up area** (FM-059) | Cumulative scope vs completed vs dashed ideal; weekly⇄monthly toggle; include-archived checkbox; dither fills per design-system §38 |
| IG-04 | **Created vs completed** (FM-060) | Grouped weekly/monthly bars + net backlog trend line (rose for growth); CSV export |
| IG-05 | **Time scatter** (FM-058) | Cycle/lead/triage-time dots; dashed p25/p50/p75/p95 lines with mono labels; dot click → issue panel |
| IG-06 | **Breakdown interaction** | Any bar/segment hover → breakdown popover (segment shares, mono); click → filtered list click-through (same AST round-trip as FB-06) |
| IG-07 | **CSV export** | Per-chart ghost button (top-right of card) — downloads the exact plotted series; export of the *underlying list* happens from the click-through view (FM-078) |
| IG-08 | **Chart empty** | "Not enough history yet — completes its first cycle to see velocity" per-card copy variant |

**Keyboard:** charts are focusable regions; `←/→` walks bars/points with mono SR announcements (value, cycle, segment); Enter activates click-through; controls are standard Selects. **Realtime:** charts re-query on demand, not on every SSE (explicit "Refresh" appears if underlying data changed while viewing — stale chip "Updated 5m ago · Refresh"). **States:** `S-charts` per card; per-card `E-empty` (IG-08); per-card `ERR-std`.

### 4.22 S-22 — AI center (R-27 queue, R-28 runs, R-29 usage, R-30 ask) · `AC-`

**Purpose:** the review home for every AI output + full transparency ledgers (FM-064/069/084). **The AI dock (§3.7) is the primary chat surface**; the `/ai/ask` tab (AC-04) and the dock share `agent_conversations` threads. Empty-state hero uses canvasui GlyphRain (design-system §7.2) — the one working-adjacent canvas moment, only when the queue is empty.

```
┌ AI ⚡ local engine ────────────────────────── [engine ▾] ┐
│ [Suggestions 6][Runs 1,204][Usage][Ask workspace]       │
│ SUGGESTIONS QUEUE                                       │
│ ┌ ⚡ local · triage · PRO-150 · 10m ──────────────────┐  │
│ │ bug ← Label    High ← Priority    Maya ← Assignee  │  │
│ │ [Accept ✓][Reject ✕][Why?][Dismiss]   expires 7d   │  │
│ └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

| ID | Element | Trigger → behavior |
|---|---|---|
| AC-01 | **Suggestions queue tab** (R-27) | Every open AI proposal in one list (AISuggestionCard, design-system §35): EngineBadge + feature + entity link + as-of mono + **diff/chip review body** (per-type presentations §8) + Accept / Reject / Why / Dismiss + **expires-in mono** (7-day countdown, P4). Filters: feature Select · entity search. Accepting writes via the same REST endpoint a human would use (architecture §6.4) |
| AC-02 | **Runs tab** (R-28) | `ai_runs` ledger table: time · feature · **EngineBadge** · actor · entity · duration mono (`12 ms`) · outcome (suggested/accepted/rejected counts). Filters: feature, engine, actor, date range. Click a run → detail popover with input hash + outcome json (read-only) |
| AC-03 | **Usage tab** (R-29) | UsageMeter rows per feature (design-system §51): invocations, p50 latency, accept-rate Sparkline, cost cell — `$0.00` mono in local mode (teal provider spend + ceiling ProgressBar when BYOK is configured, FM-084) |
| AC-04 | **Ask tab** (R-30) | Same threads as the AI dock (architecture §6.5). Opening Ask with an active dock conversation selects that thread; sending here streams into both. Deep Ask still uses the local extractive path when `chatProvider=local`. Engine badge, cited sentences, confidence mono, explicit "No confident match" when local-ask has no hit, 3 sample-question starters on empty |
| AC-05 | **Engine switcher** | Shows active routing (Local engine always first/available; provider list from env with model labels — FM-073). Per-workspace preference; switching never changes available features (features never branch on engine, architecture §6.1) |
| AC-06 | **Empty queue** | `E-empty` + GlyphRain: "No suggestions awaiting review" + "Ask your workspace" CTA → AC-04 |

**Keyboard:** `G N` insights-adjacent route is `G A` AI center (original); queue rows: `J/K`, `Enter` accept, `Backspace` reject, `D` dismiss (with modifiers documented in §6.7); tabs `←/→`. **Realtime:** new suggestions prepend with `row-pulse`; runs ledger appends live (activity SSE). **States:** `S-list` (queue) / table skeletons (runs) / `S-charts` mini (usage); per-tab empties; `ERR-std`.

### 4.23 S-23 — Settings (R-32..R-47) · `ST-`

Settings layout: SettingsNav (design-system §24) + bg-0 content with bg-2 cards; every save is optimistic with a "Saved" ghost-toast (no toast for no-op saves). The prompt's ten surfaces:

#### 4.23.1 Members (R-36)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-01 | Roster table | Avatar+name+email mono · role Select (capability-gated; owner changes owner-only) · team chips · suspend Switch (read-only mode, history preserved — FM-008; suspended avatar 40% grayscale) · remove (danger, not self/owner) · transfer ownership (owner-only, confirm dialog) |
| ST-02 | Invite dialog | Email tag input (multi) + role Select + team Select **required for guest role** (binds scope) → Create → returns link+code with Copy (SR-named, design-system §10.6 #15); 7-day expiry shown mono |
| ST-03 | Invite list | Explicit state chips per FM-007: Pending (mono countdown) · Accepted · Expired (Re-send) · Revoked; actions: Copy link · Re-send · Revoke |
| ST-04 | Admin password reset | Row action → dialog → generates temp password (mono, copy, shown once) — the v1 reset path (FM-008) |

#### 4.23.2 Teams (R-37/R-38)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-10 | Team list | Rows: key chip mono + name + member count; drag to reorder sidebar (fractional); create dialog (name, key w/ live identifier preview, timezone) |
| ST-11 | Team detail tabs | General (name, key, timezone, sidebar position, default team state) · **Workflow** (below) · Labels (team-scoped) · Cycles (enable, length 1–8w, start day, cooldown, auto-add, future-cycle count) · Triage (enable, default statuses, require-priority gate) · Estimates (scale off/linear/fibonacci/exponential/tshirt + allow-zero) · Auto-archive (window) · Members (add/remove team membership) — FM-009/083 |

#### 4.23.3 Workflows (R-39 / team Workflow tab)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-20 | State board | Six fixed **category columns** (Backlog · Unstarted · Started · Completed · Canceled · Triage-if-enabled); statuses as rows inside their category, drag to reorder **within category only** (hairline drop line), rename inline (UNIQUE(team,name) validated live), color picker (curated 12 hues), delete (blocked while it's the category's last — tooltip explains the minimum-1 rule), add-status button per category |
| ST-21 | Default-new-issue selector | Radio per Backlog-category status (FM-010) |
| ST-22 | Duplicate status | Always-present terminal status row, locked (cannot rename/delete — parity with the reserved-status model), with explainer tooltip |

#### 4.23.4 Labels (R-40)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-30 | Label list | Workspace + team sections; rows: color dot, name, usage count mono; create/edit inline (reserved names rejected live with message, FM-011) |
| ST-31 | Groups (Should) | Label-group rows with one-per-group enforcement note; drag labels into groups |
| ST-32 | Archive vs delete | Archive = confirm "Blocks new use, existing issues keep it" (label renders with archive icon); Delete = danger confirm "Removes from 214 issues" (live count) |

#### 4.23.5 Templates (R-41)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-40 | Issue/page template lists | Scope chip (workspace/team), usage count mono, create/duplicate/edit; issue template editor = S-13 chrome + sub-issue list + preset properties; page template editor = block tree (§5) |
| ST-41 | Recurrence (Should) | Per template: off/daily/weekly/monthly + next-run preview mono ("next instance Aug 17 00:01 team TZ"); edits never mutate created instances (FM-054) |
| ST-42 | Starter set | Empty state shows the curated starter templates (FM-053) |

#### 4.23.6 API keys (R-42)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-50 | Key rows | Name · prefix mono `pmx_abc1…` · scope chips (read / write / granular) · created/last-used relative mono · revoke (danger-ghost, confirm) |
| ST-51 | Create flow | Dialog: name + scopes → **secret shown once** (mono block, Copy, "Stored hashed — shown once" note), ApiKeyRow appears |
| ST-52 | Empty | "No keys" + security note (1,000 req/hour/key; 429 + Retry-After behavior) |

#### 4.23.7 Webhooks (R-43/R-44)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-60 | Webhook rows | URL mono truncate · event chips (`issue.created`…) · active Switch · secret rotate (confirm; old signatures stop) |
| ST-61 | Delivery ledger (R-44) | Rows: time · event · status mini-shield (success/danger) · response code mono · attempts + next-retry mono · payload viewer (readonly json) · **Redeliver** ghost + **Send test ping**; dead-lettered rows carry a persistent danger chip and Manual redeliver CTA (FM-076) |

#### 4.23.8 Import / export (R-45)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-70 | CSV import wizard | Step 1 Upload (dropzone, admin-only) → Step 2 **Mapping** (CSV column → field Select per column, unmapped grayed) → Step 3 **Dry-run report** (rows imported N · warnings list with row numbers · unmapped columns) → Step 4 Commit (ProgressBar; batch id shown; "Import batch is deletable for 30 days" note — FM-078) |
| ST-71 | Export | "Export current view as CSV" (respects saved-view filters — doubles as the import template) · Pages export Markdown/HTML (FM-079) |

#### 4.23.9 Workspace (R-46)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-80 | General card | Name · slug (mono, live uniqueness) · timezone Select · default landing view |
| ST-81 | Danger zone | Delete workspace: owner-only, **type-the-slug confirm** (mono input, dialog), cascades all data; transfer-ownership cross-link |

#### 4.23.10 AI (R-47)
| ID | Element | Trigger → behavior |
|---|---|---|
| ST-90 | Engine status card | Local deterministic engine: always-on shield badge. **Chat provider** Select: `local` · `claude-code` · `codex`. Model text field. `cliPath` overrides (empty = PATH). Tool allowlist. **Not installed** state: if the chosen CLI binary is missing, show "Claude Code not installed" / "Codex not installed" with install hint — chat still degrades to local (architecture §6.5). HTTP BYOK provider list remains env-driven and never feature-gates (FM-073) |
| ST-91 | Per-feature toggles | 11 features × enable + thresholds where applicable (related-content similarity threshold — FM-068) |
| ST-92 | Autonomous-apply opt-in | Triage assist auto-apply: off by default; enable requires precision display (current accept-rate mono) + explicit checkbox + type-"AUTO" confirm (FM-064/084 — Height-lesson guard) |
| ST-93 | Usage/ledger links | Deep links to R-28/R-29 |

Personal settings (routes R-32..R-35) follow the same card pattern: Profile (name, avatar seed with live dither preview, password change), Sessions (device list + IP hash + expiry + **logout-all** w/ confirm), Appearance (theme/density/motion — instant preview, no save button), Notifications (per-type toggles, NB-05 target).

**Keyboard:** settings nav = arrow keys; all dialogs keyboard-complete; destructive confirms are type-to-match. **Realtime:** member/invite/team changes propagate (SSE) to other admins' screens with `row-pulse`. **States:** standard skeletons; empties per R-table; `ERR-std`.

### 4.24 S-24 — Admin activity (R-48) · `AD-`

**Purpose:** the workspace audit ledger — user, system, and AI actors in one stream (FM-057).

| ID | Element | Trigger → behavior |
|---|---|---|
| AD-01 | Filter bar | Actor kind (Any / Person / System / **AI**) · member Select · entity Select · verb search (mono, e.g. `issue.state_changed`) · date range. Combined as a standard FB-01-styled bar (no AI entry) |
| AD-02 | Ledger rows | Time mono · actor avatar (system = gear glyph; **AI = EngineBadge**) · sentence ("Maya moved `PRO-141` from Todo to In Progress") · entity link · expand → data json (read-only). AI rows append "Why" pointers where the run recorded an explanation |
| AD-03 | Live tail | New rows prepend with `row-pulse` while viewing (activity.created SSE); "Paused" chip appears if the tab is backgrounded, click to resume |

**Keyboard:** `J/K` rows; `Enter` expands; filters standard. **States:** `S-list`; "No activity in this range" empty (adjust-range CTA); `ERR-std`.

### 4.25 S-25 — 404 (R-49) · `NF-`

`E-empty` full-screen: dither illustration (lost-tools tile), "Nothing lives at this address." + inline search input (routes to S-19) + "Go home" primary + palette hint Kbd `Cmd+K`. Old-issue redirects never land here (server-side via `issue_redirects`, §2 conventions).

---

**Screen count: 25** (S-01..S-25) covering all 49 routes.

---

## 5. Block Editor Interactions

Frame = S-18. All 19 block types per architecture §2.6. Blocks are `contenteditable`-free (custom rich-text model; server sanitizes, architecture §2.6 richText contract). Element prefix `ED-`.

### 5.1 Core editing keys

| ID | Interaction | Behavior |
|---|---|---|
| ED-01 | **Enter splits** | At caret: current block splits — content before stays, content after becomes a new block of the **same type** below (list items continue their list; headings continue as headings). At block end: inserts a new empty block (list → next list item; heading/todo/etc → new block continues type; Enter on an *empty* list/todo item exits the list to a paragraph — the standard escape hatch). Shift+Enter inserts a soft line-break (`\n` within the block, no new block) |
| ED-02 | **Backspace merges / upgrades** | At block start with content: if the block is still "formatted" (list item, todo, quote, heading, callout), the **first press upgrades it one rung toward paragraph** — nested list item outdents one level; top-level list item / todo / quote / heading / callout drops its type and becomes a paragraph (text preserved). Only when the block is already a paragraph (or a second press follows) does it **merge into the block above** (caret lands at the join). On an empty block: deletes it and focus moves to the block above (caret at its end). At the start of the *first* block: no-op (prevents destroying the page's only anchor). Merge and upgrade are each one undo step (ED-11) |
| ED-03 | **`/` slash menu** | Typing `/` at any caret opens the menu (Popover at caret, 240px, design-system §36): filter Input focused, **fuzzy match** (subsequence scoring: word-start > substring > subsequence), grouped **Basic blocks** (paragraph, H1–H3, bulleted, numbered, todo, toggle, quote, divider, callout, code, table) / **Media** (image, file) / **Embeds** (bookmark, embed, page link, issue_view) / **AI** (Continue writing · Fix grammar · Summarize selection · Ask about this page — §5.3; every AI row carries the EngineBadge) — 16px Lucide icons + name + `text-2xs` mono type hint. Arrow keys + Enter insert; Esc closes keeping the literal `/` if the menu was never filtered; recently-used items pin to top of their group; Backspace past the `/` closes it |
| ED-04 | **Markdown auto-format** (at line start, transform on trailing space/caret-advance) | `- ` → bulleted item · `1. ` → numbered · `# `/`## `/`### ` → H1/H2/H3 · `> ` → quote · `[] `/`[x] ` → todo (unchecked/checked) · ` ``` ` + language? + Enter → code block · `---` → divider. Inline (selection-wrapped): `**bold**` `*italic*` `~~strike~~` `` `code` `` . Every transform is a single undo step; typing the raw text again does not re-trigger (transform consumes the trigger characters) |
| ED-05 | **Drag handle + drop indicator** | `⋮⋮` grip + `+` insert appear in the left gutter on block hover/focus-within (design-system §37). Pointer drag: ghost = block preview card at 80% + `shadow-4`; drop indicator = 2px accent line with three affordances — **top edge** (insert before) · **bottom edge** (insert after) · **nest-left zone** (a 24px-wide highlight strip along the hovered block's left edge, glowing accent-40% during drag; drop inside it = become its child, only where children are allowed per architecture §2.6; illegal targets show a danger-tinted "can't nest" cursor state and refuse the drop). Keyboard: `Cmd+Alt+↑/↓` moves the block (with its children) between siblings; `Tab`/`Shift+Tab` indents/outdents structurally where the parent type allows |
| ED-06 | **Turn into** | Drag-handle click and block right-click (context menu) both open it; the slash menu's "Turn into" section mirrors the same list: shows only **compatible** types (text-bearing ⇄ text-bearing: paragraph/headings/lists/todo/toggle/quote/callout; code ⇄ code only; media/bookmark/embed/issue_view/table are leaf types — turn-into converts them to paragraph with their text preserved as a link where sensible). Conversion preserves text + marks; incompatible items render disabled with hint |
| ED-07 | **Multi-block selection** | Shift+click selects a range; Cmd/Ctrl+click toggles; drag from an empty gutter area = marquee. Selected blocks tint `interactive-selected`; actions apply as **one batch transaction** (architecture §3.6 `/blocks/batch`): drag-move all, turn-into all, delete all, copy (internal paste keeps block types; external paste degrades to plain text/paragraphs). **Esc clears the selection** (returns focus to the first previously-selected block); Esc again resumes normal editing |
| ED-08 | **Block controls per type** | **todo checkbox**: click toggles — check stroke draws in 160ms (`--dur-fast` family) + row text gets `text-secondary` (never strikethrough); keyboard Space on focused todo toggles. **callout**: emoji button opens picker (grid popover); default 💡. **code**: language combobox (mono options, type-to-filter; the chosen language drives client-side syntax highlighting) + wrap Switch + line numbers off; **Enter inserts soft breaks** (code never splits into blocks; splitting exits via the click-away or `Alt+Enter`-free rule: code blocks are single). **image**: paste (Cmd+V of image data), drag-drop, or file picker via slash menu; upload progress ring inside the block placeholder (percent on hover); success raises an inline alt-text prompt (skippable, re-openable from the kebab — never a modal); failure = inline retry chip, block never blocks the rest of the page. **bookmark/embed**: URL input inline → server fetch (title/description/icon; size-capped) with `dither-pulse` placeholder on brand pages only — standard shimmer elsewhere. **table**: header-row toggle, add row/column buttons on edges, cell nav by arrows (Grid pattern), cells are single-line rich text |
| ED-09 | **`issue_view` block** (FM-046) | Slash-menu insertion opens the **view-picker sub-row**: Combobox over saved views (or "Create new view" inline). Renders the view's layout (list/board/table) as a live, **read/write** embed: inline property edits (L-03/T-02 engines reused), 50/page cursor + virtualization (architecture §9), SSE-live (`row-pulse` on remote changes). Embed chrome: view name + layout switch + "Open view" link + owner kebab (Swap view, Remove); the view's active filters render above the rows as read-only "viewing as" chips (T-03 pattern) so scope reads at a glance. **View edits propagate everywhere** (SV-08): editing the source view updates every embed with a 150ms crossfade on the changed chrome |
| ED-10 | **`@` mentions + hover cards** | Typing `@` opens the mention Combobox (150ms debounce): **people** (avatar + name + mono email), **pages** (icon + title), **issues** (identifier mono + title + state dot). Enter/click inserts a mention node (richText `mention`, architecture §2.6). Mentioned users without page access → author sees a warning toast at save time (FM-055 parity). Hovering any mention (300ms) → HoverCard: person card / page peek / issue mini-card; clicking navigates (page link scroll + `?block=` anchor; issue opens panel). Typing `PRO-1` autocompletes identifiers without `@` (identifier-prefix trigger) |
| ED-11 | **Undo / redo** | `Cmd+Z` / `Cmd+Shift+Z`; 100-step stack, typing coalesced per 800ms window; structural ops (split/merge/move/nest/turn-into/multi-batch) are atomic single steps; undo of a delete restores the block tree including children. Redo is invalidated by new input (standard linear-history model). The page header carries a quiet undo indicator — undo glyph + mono step count, disabled-dim at stack-empty — so stack depth is visible without a menu trip |
| ED-12 | **Autosave** | Block edits debounce **800ms** → PATCH batch (`/blocks/batch` for multi-op, single PATCH otherwise). Dirty indicator: 6px dot beside the page title ("Unsaved changes" tooltip) appears with the first debounced byte, clears on ack. **Offline queue**: edits serialize into the local queue (§9.5) and flush as one batch on reconnect, then the §9.5 synced toast confirms ("Back live — synced N page edits"); conflict policy §9.4 applies per block. Page `version` bumps ride every save; page history snapshots coalesce to ~10-minute windows (FM-047) |
| ED-13 | **Inline formatting** | Selection + toolbar or chords: `Cmd+B/I/U`… (bold/italic/underline? — **bold, italic, strike, code, link only**: `Cmd+B` `Cmd+I` `Cmd+Shift+X` strike `Cmd+E` code `Cmd+K` link-with-URL-popover). Marks render per architecture richText; link URLs scheme-validated client-side (http/https/mailto) with invalid paste → plain text |
| ED-14 | **Block kebab menu** | Duplicate (below) · Copy link to block (`#block-<id>` deep link, every block linkable — FM-045) · Turn into ▸ · Delete · (todo) Check/uncheck all children · (toggle) Collapse/expand |
| ED-15 | **Toggle blocks** | Chevron collapses children (persisted `collapsed` prop); collapsed shows a mono child-count badge; children remain in the document (searchable, exported) |

### 5.2 Editor states

| State | Rendering |
|---|---|
| Loading | Title bar + 10 block shimmer lines (R-23 contract) |
| Empty page | One paragraph block + title placeholder "Untitled" |
| Save states | Clean (no dot) · dirty (dot) · saving (dot pulses once) · saved (dot clears — no toast; silence is trust) · offline (dot + §9.5 banner governs) |
| Remote block changes | Other users' block updates reconcile via `block.updated`; blocks not being edited update in place + 150ms crossfade; the block you're editing follows §9.4 |
| Errors | Single-block failure = inline retry chip on that block, editor keeps working (never a page-level error for one block); page-load failure = `ERR-std` |

---
## 6. Keyboard Map

Single source of truth for `?` help overlay (R-49/palette action) and `Cmd+/` cheat sheet. All single-key shortcuts are **disabled while typing** in an input, textarea, or rich-text block (detection: activeElement matches editor/input selectors); they stay live on list rows, board cards, and chrome. Every binding renders a `data-key` attribute for future rebinding. Platform: `Cmd` = `Ctrl` on Windows/Linux (shown as such in the help overlay).

### 6.1 Global (anywhere in the app)

| Keys | Action |
|---|---|
| `Cmd+K` | Open command palette (§7) |
| `Cmd+Shift+P` | Palette in AI mode (AI actions surfaced first, §7.2) |
| `G` then `I` | Go → All issues |
| `G` then `M` | Go → My issues |
| `G` then `P` | Go → Projects |
| `G` then `C` | Go → Current cycle |
| `G` then `D` | Go → Docs home |
| `G` then `N` | Go → Inbox (notifications) |
| `G` then `B` | Go → Triage (teams with triage enabled) |
| `G` then `A` | Go → Insights |
| `G` then `L` | Go → AI center |
| `G` then `S` | Go → Settings |
| `G` then `H` | Go → Home (inbox home) |
| `C` | Create new issue (modal, S-09) |
| `Cmd+Shift+D` | Create new doc (page) |
| `/` | Focus the filter bar on views; focus search on docs home |
| `?` (Shift+/) | Keyboard help overlay (Esc closes) |
| `Esc` | Close topmost layer: palette → dialog → panel → menu → selection (in that order, one press each) |
| `Cmd+\` | Toggle sidebar collapse |
| `Cmd+.` | Toggle right panel (issue detail) |
| `Cmd+J` | Toggle AI dock (§3.7) |
| `Cmd+Shift+F` | Global search (palette in search mode) |
| `F1` | Jump to workspace switcher |

### 6.2 Issue list / rows (list & table views)

| Keys | Action |
|---|---|
| `J` / `K`, `↓` / `↑` | Move focus down/up (wraps at edges, group headers skipped) |
| `Enter` | Open focused issue in right panel |
| `Shift+Enter` | Peek (opens panel + focuses title for rename) |
| `X` | Toggle row selection (selected count + bulk bar appears) |
| `Shift+X` | Select range from last anchor |
| `Cmd+A` | Select all loaded rows (bulk bar shows count; `Esc` clears) |
| `E` | Assignee picker (popover on row) |
| `L` | Label picker (multi-select popover) |
| `P` | Project picker |
| `Y` | Cycle picker (`C` is taken by create) |
| `S` | State picker |
| `I` | Priority picker |
| `M` | Move to team picker |
| `A` | Archive (undo toast 5s) |
| `Cmd+D` | Duplicate issue |
| `Delete` / `Backspace` | Archive focused/selected (same as `A`) |
| `[` / `]` | Collapse / expand the focused group |
| `Cmd+Enter` | In new-issue modal: create; in list: open focused in panel |

### 6.3 Board view

| Keys | Action |
|---|---|
| `↑` / `↓` | Move focus across cards within a column |
| `←` / `→` | Move focus across columns |
| `Space` | Lift card (keyboard drag mode: card lifts with `card-lift`, arrow keys now move it) |
| `←` / `→` (lifted) | Move card across columns (sets state — explicit property change, undo toast) |
| `↑` / `↓` (lifted) | Reorder within column |
| `Enter` (lifted) | Drop (commits, toast + `row-pulse`) |
| `Esc` (lifted) | Cancel drop, card returns with 160ms settle |
| `Enter` (focused) | Open issue panel |
| `Shift+Space` | Quick-move menu (state picker as menu, no drag) |

### 6.4 Page editor

Covered in §5 (ED-01…ED-15). Summary chords: `Cmd+Enter` save+close editor tab · `Esc` close panel/cancel · `Tab`/`Shift+Tab` nest/unnest · `Cmd+Alt+↑/↓` move block · `Cmd+B/I`, `Cmd+Shift+X` strike, `Cmd+E` code, `Cmd+K` link · `Cmd+Z`/`Cmd+Shift+Z` undo/redo.

---

## 7. Command Palette Spec

### 7.1 Triggers and shell

- `Cmd+K` anywhere; `/` in filter contexts (palette opens with filter tokens prefilled); `Cmd+Shift+P` = AI mode (§7.2). Also a persistent 28px "Search" affordance in the top bar (density-aware) that opens the same palette.
- Shell: 640px wide, top-centered at 12vh, backdrop `overlay-40`, 160ms `palette-in` (scale 0.98→1, opacity fade). Input row (28px, mono placeholder "Search or run a command…"), results below, footer with kbd hints: `↑↓ navigate · ↵ select · ⇥ complete · esc close`.
- Max 8 result rows visible; internal scroll beyond (scrollbar-thin). Each row: 16px icon, primary label, secondary `text-tertiary` context (e.g., team · state), right-aligned kbd hint when a direct shortcut exists. AI rows carry the EngineBadge (⚡ local).
- `↑`/`↓` move (wrap), `Enter` execute, `Tab` complete highlighted token into the input (for prefix modes), `Shift+↑↓` move without wrapping, `Cmd+1…9` jump to section headers.

### 7.2 Prefix modes and sections

Typed prefixes reshape behavior: `>` commands only · `#` labels · `@` people · bare issue identifier (e.g., `PRO-42`) → direct jump row pinned first. Default query (no prefix) searches across, in rank order:

1. **Actions** — commands matching the query (Create issue, New doc, Toggle theme, Toggle AI dock, Invite member, Import CSV…), scored exact > prefix > fuzzy subsequence.
2. **Navigation** — routes and saved views matching.
3. **Recent issues** — your last-opened 20, recency-weighted 0.3.
4. **Pages** — FTS5 title+body matches, ranked bm25, grouped under page icons.
5. **AI actions ⚡** — feature verbs surfaced when the query contains action words (summarize, triage, draft, dedupe, label, filter, ask): "Summarize 'Payments latency' project ⚡", "Ask the workspace: <query> ⚡".
6. **Settings** — settings screens matching.

Usage-frequency boost from the last 100 palette executions (weight 0.2) reorders within a section, never across section rank.

### 7.3 NL→filter chaining (FM-061)

When the palette opens in an issues context (or the query starts with `filter:`), typing free text like `urgent payment bugs from last week` appends the row **"Build filter from '<query>' ⚡"**. Enter → parse preview dialog: chips for each parsed token (`priority:Urgent` `label:payments` `label:bug` `created:≤7d`) — each chip editable/removable before apply (parse is labeled "parsed locally ⚡"; unknown tokens render as plain-text search chip). `Enter` applies the filter to the current view (filter bar animates chips in, 160ms stagger 20ms); `Esc` cancels back to the palette with query intact. Applied filter is savable as a view via the filter bar's save action (S-06).

### 7.4 States

| State | Rendering |
|---|---|
| Empty query | "Recent" (last 8 executions) + per-section top items + pinned rows "Ask the workspace ⚡" and "Toggle AI dock" |
| No results | "No matches for 'X'" + fallback row "Ask the workspace about 'X' ⚡" (routes to AI center with query prefilled) |
| AI running | 3 skeleton rows + ⚡ badge + "thinking locally…" caption (never a spinner-blocking pattern; results stream in by row) |
| AI error | Row degrades to plain search results + footer note "AI unavailable — showing search" |

---

## 8. AI Interaction Patterns (one per feature, FM-062…FM-071)

Universal rules first — every AI surface obeys all of these:
- **EngineBadge always**: ⚡ local (deterministic engine) or ◈ provider label. Results from a provider that degraded to local show "⚡ fell back from ◈".
- **Nothing auto-applies without review** unless the workspace opts in per-feature (Settings → AI, FM-073); autonomous apply additionally requires precision ≥ threshold from accepted feedback.
- **Every accepted suggestion is undoable** (5s toast + permanent revert entry in the entity's activity log, actor = you + "via AI ⚡").
- **Every run logs to `ai_runs`** and appears in AI Center → Run log (feature, engine, duration, outcome, link to entity).
- **Suggestions expire after 7 days** (stale banner → regenerate).
- Failure states are uniform: 3s timeout → quiet no-op with "AI unavailable" tooltip; empty context → "Not enough context yet"; engine error → plain error card + Retry. AI never blocks a mutation path (architecture §9).

### 8.1 NL→filter (`nlq`, FM-062)
Trigger: palette row "Build filter from '…' ⚡" (§7.3); filter bar "✨ Describe" chip. Request state: chip preview dialog with 3 skeleton chips. Result: parsed chips (`priority:Urgent`, `label:payments`, `created:≤7d`), each editable/removable; ambiguous tokens return **clarifying chips** ("did you mean label 'payments' or project 'Payments'?") — never a silent guess. Accept: `Enter`/Apply → filter bar animates chips in (160ms, 20ms stagger) + "Save as view" affordance glows once. Reject: `Esc` (query preserved). No mutation → no undo needed.

### 8.2 Duplicate detection (`dedup`, FM-063)
Trigger: automatic banner on issue open when candidates ≥ 60% similarity; manual "Find duplicates ⚡" in issue kebab. Result: banner card "Similar to PRO-31 (74%) — shared: 'timeout', 'checkout'" with **Diff-style compare view** (side-by-side titles/descriptions, shared terms highlighted). Actions: `M`/Merge-duplicate (marks this issue duplicate-of, links, keeps both bodies in description) · `Not a duplicate` (logs negative feedback, raises future threshold for the pair) · `Mute for this issue`. After merge: undo toast 5s "Merged as duplicate of PRO-31 — Undo"; both issues stay in activity with relation created.

### 8.3 Triage assist (`triage`, FM-064)
Trigger: triage inbox rows show a ⚡ suggestion chip strip (labels/priority/team with confidence); full card on expand. Result: scored suggestions with **matched-rule trace** ("rule: stack-trace→bug · similar to 5 labeled 'crash'"). Accept: `A`/Apply-all (itemized, each row toggleable) → rows animate out of triage (320ms). Reject: `R`/Dismiss per chip; feedback stored. Trust: suggestion-only until workspace opt-in (Settings → AI); when autonomous, applied rows carry "⚡ auto-applied — Review" and stay revertible from the Triage log tab.

### 8.4 Summarize (`summarize`, FM-065)
Trigger: "Summarize ⚡" in issue panel (comments tab), project overview, cycle view; palette AI row. Request state: summary card skeleton (3 lines) + ⚡ badge + "reading N comments…". Result: extractive summary where **every sentence is a citation chip** — hover shows source comment/block, click scrolls+highlights the source row 300ms. Actions: Copy · Regenerate · Dismiss. No mutation; summaries cached per entity until 5 new comments arrive ("stale — regenerate").

### 8.5 Ask the workspace (`ask`, FM-066)
Trigger: palette "Ask the workspace ⚡" row / empty-state fallback; AI Center ask box. Result: answer card = extractive cited sentences (source chips: issue/page + bm25 score), confidence bar (Low/Med/High from retrieval score); below threshold → explicit **"No confident match"** card + top-3 nearest results as links. Follow-ups: keep a conversation thread (chat surface) per ask session; thread capped 10 turns. Never mutates anything.

### 8.6 Draft assist (`draft`, FM-067)
Trigger: issue description empty-state "Draft a spec ⚡"; docs slash menu → AI → "Draft from outline"; project update composer "Draft update ⚡". Result: **Proposal diff mode** — editor shows ghost content (accent-tinted, italic) beside "Accept ⚡ / Discard"; entity references render as real pills only when validated against workspace schema, otherwise plain text. Accept: ghost → real blocks (one undo step, "as of HH:MM" stamp inserted at top). Discard: ghost fades 160ms. Never auto-saves.

### 8.7 Related issues (`related`, FM-068)
Trigger: passive right-panel section on issue open (opt-out per workspace). Result: ranked list (TF-IDF cosine + age decay), each row showing shared-term highlights ("shares: 'retry', 'webhook'") and why-ranked chip. Actions: `+` Relate (creates relation, undo toast) · open · hide row. Threshold slider lives in Settings → AI. Passive = never proposes mutations beyond explicit relate.

### 8.8 Hygiene digest (`hygiene`, FM-069)
Trigger: weekly digest notification (inbox) + AI Center → Hygiene tab; manual "Run now". Result: itemized digest card groups (Stale ≥14d · Unassigned · Unlinked to projects · Duplicate clusters) each with counts and per-item rows. Apply: **explicit itemized apply** — checkboxes (default none), Apply-N shows exact preview ("will archive 3, assign 2 to Maya, link 5 → Payments"); each item undoable individually via undo tokens; weekly run cap enforced. Dry-run by default.

### 8.9 Meeting notes → action items (`meeting`, FM-070)
Trigger: paste transcript/doc into AI Center → "Extract action items ⚡"; docs slash menu on selection. Result: **review tray** of drafted action items ("Maya owns follow-up with Payments by Fri" → parsed: assignee=Maya ✓, project=Payments ✓, due=Friday ✓; unknown entities stay unlinked text with amber chip "not found — pick manually"). Actions: convert checked items to issues (new-issue modal prefilled per row, batch create) or to doc todos. One undo step for the whole batch (toast: "Created 3 issues — Undo").

### 8.10 Issue clustering (`cluster`, FM-071)
Trigger: AI Center → Clusters tab; backlog view "Cluster backlog ⚡". Result: cluster cards (cohesion score, shared-terms headline, member chips) rendered over the open-issue set; memberships **editable** (drag issue between clusters, remove). Actions: "Create project from cluster" (explicit, pre-filled create-project dialog — never auto-creates) · Export as list. Read-only until an explicit user action; every action logged.

---

## 9. Realtime & Presence UX

### 9.1 Presence avatar stack (top bar)
- Right-aligned before the bell: stacked 24px avatars (2px ring `bg-1`), max 4 + "+N" chip (popover lists all). Generative dither avatars for photo-less members (design-system §6).
- **Live field**: each avatar's HoverCard (300ms) shows name, role, and "Viewing: PRO-42 · Board" — refreshed from presence heartbeats. An avatar viewing the *same entity* as you gets a soft accent ring (200ms fade-in).
- Heartbeat every 15s; ghosts cleaned up after 60s silence (avatar fades out 320ms). Guest presence hidden from non-admins (permissions matrix).

### 9.2 Editing indicators
- No field-level typing indicators (calm > chat-like). Instead, when ≥2 users have the same issue panel/page open, the panel header shows a compact "editing now" avatar pair, and SSE `presence` events toggle per-user dots.
- Issue panel field conflicts: see §9.4.

### 9.3 Change toasts for open entities
- When an SSE event patches an entity you have open but are NOT editing (e.g., someone moves PRO-12 to Done while you read its comments): non-focused fields auto-refresh + `row-pulse` 300ms; a quiet toast bottom-right: "Maya moved PRO-12 to Done — Jump" (Jump scrolls/opens the changed field; toast auto-dismisses 6s, stack max 3).

### 9.4 Conflict policy (per field, last-writer-wins)
- Optimistic local edit wins while your caret is inside the field. If a remote patch touches **the field you are editing**: keep local content, show amber toast "Maya also edited this field — yours saved" with "View theirs" (opens the field's history popover diff).
- Remote patches to fields you're NOT editing: applied live, no prompt, soft highlight `row-pulse`.
- Board/list rows you're not hovering: reorder animates 320ms slide.

### 9.5 Reconnect banner
- SSE drop → top banner slides in (`toast-in`, 160ms): amber dot + "Reconnecting…" + spinner; queued mutations show a count badge ("3 changes waiting").
- On reconnect: banner flips to green "Back live — synced N changes" (flush order preserved), auto-dismiss 1.5s; failed flushes roll back optimistically with error toast + 160ms shake on affected rows.
- Offline editing continues locally (queue persists in memory; page edits queue per §5 ED-12).
---

## 10. Motion Spec

Tokens and named animations are defined in design-system §8 (durations: micro 80ms, fast 160ms, standard 320ms, slow 480ms; easings: ease-out-quint default, ease-in-out for moves, spring for lifts). This table binds interactions to them:

| Interaction | Animation | Token |
|---|---|---|
| Command palette open/close | scale 0.98→1 + fade | `palette-in` 160ms ease-out |
| Sidebar collapse/expand | width 240→48px, content crossfade | `panel-slide` 320ms ease-in-out |
| Right panel (issue detail) open | slide from right | `panel-slide` 320ms ease-out |
| Board card keyboard-lift/drag | +shadow-lg, 2° tilt, 1.02 scale | `card-lift` 160ms spring |
| Card drops to new column | column slide-in + settle | 320ms ease-in-out |
| Issue created | row inserts, height 0→full | `row-in` 160ms ease-out |
| SSE-patched row/field | soft accent background fade-out | `row-pulse` 300ms |
| Toast enter/exit | slide-up + fade | `toast-in` 160ms |
| Route change | crossfade only (no slide; app feels stationary) | 160ms |
| Group collapse/expand | height animate, chevron rotate 90° | 320ms ease-in-out |
| Checkbox complete | check stroke draw + row dim | 160ms |
| Ghost AI proposal accept | ghost→real crossfade + stamp | 160ms |
| Empty-state reveal (docs home, AI center) | dither texture fade-in | `dither-fade` 480ms |
| Skeleton loading | shimmer | `shimmer` 1.2s loop |
| Undo toast shake on failure | ±4px x oscillation ×2 | 160ms |

**Never animates**: caret movement, text input latency, others' row reorders while you hover that row, page-load blocking (content only renders when ready), scroll position (SSE patches never scroll the user).

**Reduced motion** (`prefers-reduced-motion: reduce`): all durations collapse to 1ms (instant state), tilt/crossfade/shimmer disabled, dither renders static (no animation frames), card-lift becomes a 1px outline highlight. No information is ever conveyed by motion alone.

---

## 11. Copy / Voice Table (original microcopy)

Voice: plain, warm-terse, workshop-metaphor sparingly. Never cutesy, never corporate. Sentence case. Periods only in multi-sentence strings.

| Context | String |
|---|---|
| Inbox empty | "Nothing needs you right now. Enjoy the bench." |
| Issues empty (filtered) | "No issues match this filter." + "Clear filter" action |
| Issues empty (workspace new) | "The board is clear. Create your first issue — press C." |
| Docs home empty | "Every project deserves a paper trail. Start a page." |
| Search empty | "No matches for '{q}'." + "Ask the workspace ⚡" row |
| Triage empty | "Inbox zero. New arrivals land here." |
| Notifications empty | "Quiet shift. You're all caught up." |
| Insights empty | "Ship a cycle and the charts will fill in." |
| SSE offline | "Reconnecting…" / "{n} changes waiting" |
| SSE synced | "Back live — synced {n} changes" |
| Undo toasts | "Moved to {state} — Undo" · "Archived {id} — Undo" · "Merged as duplicate of {id} — Undo" · "Created {n} issues — Undo" · "Label {name} removed — Undo" |
| AI labels | "⚡ local engine" · "◈ provider: {model}" · "⚡ fell back from ◈" · "Reviewed by you" · "Suggestion expires in {n}d" · "parsed locally ⚡" |
| AI no-confidence | "No confident match in this workspace." + nearest links |
| AI proposal | "Draft ready — review before it's real." |
| Permission denied | "You don't have access to this. Ask a workspace admin." |
| 404 | "This bench doesn't exist." + "Back to inbox" |
| 500 | "Something broke on our bench. It's been logged." + Retry |
| Delete workspace confirm | "Type the workspace name to confirm. This cannot be undone." |
| Archive confirm (bulk) | "Archive {n} issues? You can undo for 5 seconds." |
| Onboarding invite skip | "You can invite teammates anytime from Settings → Members." |
| Sample data prompt | "Seed the demo bench?" + "Start clean instead" |
| Webhook test | "Ping sent — awaiting delivery." |
| API key created | "Copy this key now. It won't be shown again." |

---

## 12. Onboarding Choreography

Target: first value in under 90 seconds; the "aha" is instant search over seeded demo data.

| # | Step | UI | Timing/notes |
|---|---|---|---|
| 1 | Signup | S-02 signup form (email, password, name) | validation inline; no email verification gate for v1 (noted in README) |
| 2 | Workspace | "Name your workshop" — workspace name input; slug auto-generated editable live; logomark dither-reveals the name (canvasui DecryptReveal, reduced-motion: static) | ≤10s |
| 3 | First team | Team key picker (3-letter, mono, live check "PRO taken? try PRC") + team name | default suggestion from workspace name |
| 4 | Invite | Email invites (0..n) with role pick; "Skip for now — invite later from Settings → Members" | skippable in one click |
| 5 | Sample data | "Seed the demo bench?" — 24 issues across 2 projects, 1 cycle, 4 docs, 3 users (demo Maya, Theo, Sam) OR "Start clean" | choice persisted; clean path still gets 3 coach marks |
| 6 | Landing | Lands on Inbox home with 4-step coach-mark tour: (1) "Press Cmd+K — everything starts here", (2) "Filter anything — or just describe it ✨", (3) "Docs live beside issues — G then D", (4) "AI runs locally ⚡ — see it all in the AI center" | coach-marks dismiss on any interaction; "Skip tour" always visible |
| 7 | Aha moment | Coach-mark 1 prompts typing "payment" in palette → FTS results appear <100ms with the seeded latency incident on top | the moment sells the local-first promise |

Progress persists per user (step index in onboarding state); refresh resumes at the same step. Every step has a visible "Skip setup" path to Inbox (remaining steps folded into a dismissable checklist card on Home until done or dismissed).
