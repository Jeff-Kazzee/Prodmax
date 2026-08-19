# Prodmax Architecture — Canonical System Design

**Doc owner:** consolidation agent | **Date:** 2026-08-18 | **Status:** BINDING for build modules M0–M10
**Stack (locked):** Astro 5 SSR (Node adapter) hosting one full React island (React Router client-side inside a catch-all route) · Tailwind + shadcn/ui · dither-kit charts/avatars · canvasui signature effects · icons0/Iconify · shieldcn badges · SQLite via Drizzle ORM + better-sqlite3 (file DB, FTS5) · custom email+password auth with HTTP-only cookie sessions · SSE live sync + presence · keyless-first AI layer (deterministic engine = provider #0; local CLI agents `claude-code`/`codex` optional; HTTP LLM providers optional via env).
**Model:** multi-user, multi-workspace; roles owner / admin / member / guest.

Cross-references: features are FM-NNN from `planning/research/feature-matrix.md`; tests are AT-NNN from `planning/qa/acceptance-tests.md`.

---

## 1. System Diagram

```
                        ┌─────────────────────────────────────────────────────────────┐
                        │                        BROWSER                              │
                        │  Astro SSR shell → ONE React island (SPA)                   │
                        │  ┌───────────────────────────────────────────────────────┐  │
                        │  │ React Router (client-side, catch-all route)            │  │
                        │  │ · App shell (sidebar, palette Cmd+K, hotkeys, theme)   │  │
                        │  │ · Features: issues / projects / docs / insights /      │  │
                        │  │   inbox / settings / AI surfaces                       │  │
                        │  │ · Local store = entity cache + optimistic mutations    │  │
                        │  │ · SSE client (EventSource) → reconciliation            │  │
                        │  └───────────────────────────────────────────────────────┘  │
                        └───────▲───────────────────────────────▲─────────────────────┘
                     HTML (SSR) │                               │ fetch (JSON, same-origin,
                                │                               │ credentials + X-CSRF-Token)
                                │                               │ EventSource /api/events
                        ┌───────┴───────────────────────────────┴─────────────────────┐
                        │                     ASTRO SERVER (Node)                     │
                        │                                                            │
                        │  Astro middleware (every request)                           │
                        │   · session cookie → user (or 401 for /api/*)               │
                        │   · workspace resolution (?wsId / session default)          │
                        │   · CSRF token check on mutating methods                    │
                        │   · rate limiter (auth routes; API-key requests)            │
                        │                                                            │
                        │  /api/** REST endpoints (zod-validated JSON)                │
                        │   ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
                        │   │ API-key    │  │ SSE        │  │ Static/assets      │    │
                        │   │ auth path  │  │ endpoint   │  │ (Astro build)      │    │
                        │   │ (scoped)   │  │ /api/events│  └────────────────────┘    │
                        │   └─────┬──────┘  └─────┬──────┘                           │
                        │         │               │ subscribe                        │
                        │  ┌──────▼───────────────▼──────────────────────────────┐   │
                        │  │ SERVICE LAYER (src/lib/services/*)                  │   │
                        │  │  · workspace-scoped queries (row-level rule §7)     │   │
                        │  │  · domain rules (numbering, rollover, merge, grace) │   │
                        │  │  · writes → EVENT BUS (in-process pub/sub)          │   │
                        │  │  · AI calls routed through AIProvider interface     │   │
                        │  └──────┬──────────────────────┬───────────┬───────────┘   │
                        │         │                      │           │                │
                        │  ┌──────▼───────┐   ┌──────────▼───────┐ ┌─▼─────────────┐ │
                        │  │ Drizzle ORM  │   │ WEBHOOK          │ │ AI LAYER      │ │
                        │  │ better-      │   │ DISPATCHER       │ │ provider #0 = │ │
                        │  │ sqlite3      │   │ (HMAC-sign,      │ │ deterministic │ │
                        │  │ (sync, WAL)  │   │  retry queue)    │ │ local engine; │ │
                        │  └──────┬───────┘   └──────────┬───────┘ │ optional LLM  │ │
                        │         │                      │         │ via env (BYOK)│ │
                        │  ┌──────▼───────────┐   ┌──────▼───────┐ └───────┬───────┘ │
                        │  │ SQLite file      │   │ webhook_     │ ┌───────▼───────┐ │
                        │  │ data/prodmax.db  │   │ deliveries   │ │ ai_runs       │ │
                        │  │ + FTS5 indexes   │   │ (retry log)  │ │ (ledger)      │ │
                        │  └──────────────────┘   └──────────────┘ └───────────────┘ │
                        │  data/uploads/ (attachment files)                          │
                        └────────────────────────────────────────────────────────────┘
```

Key properties
- **Single process.** better-sqlite3 is synchronous; the event bus is an in-process pub/sub. One Node process = one workspace server. Horizontal scale is out of scope for v1 (documented limitation).
- **One React island.** Astro serves the shell + initial state via SSR; after hydration the island is a full SPA (React Router). No per-route islands.
- **Same service layer for UI and API.** `/api/**` endpoints are thin zod-validated wrappers; nothing bypasses services.
- **Writes fan out** to: SQLite (truth) → event bus → (a) SSE broadcast, (b) webhook dispatcher, (c) derived counters invalidation, (d) FTS5 index update, (e) notification generation.

---

## 2. Data Model (SQLite via Drizzle)

**Conventions (binding on all modules)**
- PKs: `id TEXT` = UUIDv7 (time-sortable, generated app-side). Exceptions: tables noted `INTEGER PRIMARY KEY AUTOINCREMENT` (activity_events, event_log) used for strict ordering/replay.
- Timestamps: `INTEGER` Unix milliseconds (`created_at`, `updated_at`). Dates (due/target): `TEXT` `YYYY-MM-DD`.
- Booleans: `INTEGER` 0/1. Money/JSON: `TEXT` JSON where noted (`json` columns validated by zod schemas in `src/lib/validation`).
- Soft delete: `deleted_at INTEGER NULL` (trash window 30 days, purge job). Archive: `archived_at INTEGER NULL`.
- **Every workspace-scoped row carries `workspace_id`** (denormalized even when derivable, e.g. issues) so the row-level scoping rule (§7) is one predicate.
- FKs: `REFERENCES … ON DELETE CASCADE` unless noted. All FK parents include `workspace_id` where applicable to prevent cross-workspace parenting (composite FK where Drizzle supports it; otherwise enforced in service layer).
- `version INTEGER NOT NULL DEFAULT 1` on mutable hot entities (issues, pages, blocks) — bumped on every write; used for optimistic concurrency (FM-090) and SSE ordering.

### 2.1 Identity & access

**users**
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid7 |
| email | TEXT NOT NULL UNIQUE COLLATE NOCASE | |
| password_hash | TEXT NOT NULL | scrypt (N=16384, r=8, p=1), salt embedded |
| name | TEXT NOT NULL | |
| avatar_seed | TEXT NOT NULL | seed for dither-kit avatar |
| created_at / updated_at / last_seen_at | INTEGER | |

**sessions**
| column | type | notes |
|---|---|---|
| id | TEXT PK | SHA-256 of cookie token (raw token never stored) |
| user_id | TEXT FK users CASCADE | index |
| created_at / expires_at / last_used_at | INTEGER | expiry 30 d rolling; absolute cap 90 d |
| user_agent / ip_hash | TEXT | display-only in session list |
| revoked_at | INTEGER NULL | soft revoke for logout-all |

**workspaces**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| slug | TEXT NOT NULL UNIQUE | `[a-z0-9-]{3,40}` |
| timezone | TEXT NOT NULL DEFAULT 'UTC' | |
| settings | TEXT NOT NULL DEFAULT '{}' | json: default landing view id, insight defaults |
| created_at / updated_at | INTEGER | |

**workspace_members**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | UNIQUE(workspace_id, user_id) |
| user_id | TEXT FK CASCADE | |
| role | TEXT NOT NULL CHECK (role IN ('owner','admin','member','guest')) | |
| created_at | INTEGER | |
Indexes: (workspace_id), (user_id).

**invites**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index |
| email | TEXT NOT NULL | tag only (no email sent in v1) |
| role | TEXT NOT NULL | as above |
| team_id | TEXT NULL FK teams | required for guest invites |
| token_hash | TEXT NOT NULL UNIQUE | SHA-256 of invite code |
| created_by | TEXT FK users | |
| created_at / expires_at (7 d) / accepted_at / revoked_at | INTEGER | |
Index: (workspace_id, email).

### 2.2 Teams, workflow, labels

**teams**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | UNIQUE(workspace_id, key) |
| key | TEXT NOT NULL | identifier prefix, `[A-Z][A-Z0-9]{1,5}` |
| name / description | TEXT | |
| timezone | TEXT | falls back to workspace |
| position | TEXT NOT NULL | fractional index (sidebar order) |
| default_state_id | TEXT NULL FK states | first Backlog state by default |
| triage_enabled | INTEGER DEFAULT 0 | |
| triage_state_id | TEXT NULL FK states | category 'triage' |
| cycles_enabled / cycle_length_days / cycle_start_day (0=Sun) / cooldown_length_days / auto_add_to_cycle / next_cycle_number | INTEGER | cycle config |
| estimate_scale | TEXT CHECK IN ('off','linear','fibonacci','exponential','tshirt') DEFAULT 'off' | |
| estimate_allow_zero | INTEGER DEFAULT 0 | |
| auto_archive_days | INTEGER NULL | completed-issue auto-archive window |
| created_at / updated_at / archived_at | INTEGER | |

**team_members** — who belongs to a team (all roles get rows; for guests this is the scope boundary)
| column | type |
|---|---|
| id | TEXT PK |
| team_id | TEXT FK CASCADE — UNIQUE(team_id, user_id) |
| user_id | TEXT FK CASCADE |
| created_at | INTEGER |
Indexes: (user_id).

**states**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| team_id | TEXT FK CASCADE | index |
| name | TEXT NOT NULL | UNIQUE(team_id, name) |
| category | TEXT NOT NULL CHECK IN ('backlog','unstarted','started','completed','canceled','triage') | fixed set (FM-010) |
| position | TEXT NOT NULL | fractional; reorder within category only |
| color | TEXT | |
Default seed per team: Backlog, Todo, In Progress, Done, Canceled (+ Triage state iff triage_enabled).

**labels**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index |
| team_id | TEXT NULL FK teams | NULL = workspace label |
| name | TEXT NOT NULL | reserved names rejected (assignee, cycle, priority, project, state, status) |
| color | TEXT | |
| description | TEXT | |
| group_id | TEXT NULL FK label_groups | one label per group per issue (service-enforced) |
| archived_at | INTEGER NULL | archive blocks new use |
| created_at | INTEGER | |
Uniqueness (workspace_id, team_id, name) enforced in service layer (SQL NULL semantics).

**label_groups**
| column | type |
|---|---|
| id | TEXT PK |
| workspace_id | TEXT FK CASCADE — UNIQUE(workspace_id, name) |
| name | TEXT NOT NULL |
| position | TEXT NOT NULL |

### 2.3 Issues spine

**team_counters** — identifier allocation (see §2.10)
| column | type |
|---|---|
| team_id | TEXT PK FK teams CASCADE |
| next_number | INTEGER NOT NULL DEFAULT 1 |

**issues**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | scoping predicate |
| team_id | TEXT FK CASCADE | |
| number | INTEGER NOT NULL | from team_counters |
| identifier | TEXT NOT NULL | `PRO-123`; UNIQUE(workspace_id, identifier) |
| title | TEXT NOT NULL | 1–512 chars |
| description_md | TEXT NOT NULL DEFAULT '' | markdown (issue descriptions are markdown, not blocks — keeps M3 independent of M5) |
| state_id | TEXT FK states | index |
| priority | INTEGER NOT NULL DEFAULT 0 CHECK (0–4) | 0 none, 1 low, 2 medium, 3 high, 4 urgent |
| estimate | INTEGER NULL | points per team scale (t-shirt mapped: XS1 S2 M3 L5 XL8) |
| assignee_id | TEXT NULL FK users SET NULL | index |
| creator_id | TEXT FK users | |
| project_id | TEXT NULL FK projects SET NULL | one project at a time |
| milestone_id | TEXT NULL FK milestones SET NULL | |
| cycle_id | TEXT NULL FK cycles SET NULL | current/last cycle membership |
| parent_id | TEXT NULL FK issues CASCADE | sub-issues; index |
| due_date | TEXT NULL | |
| position | TEXT NOT NULL | fractional index (manual order, per team) |
| started_at / completed_at / triaged_at | INTEGER NULL | time metrics + rollover logic |
| version | INTEGER NOT NULL DEFAULT 1 | optimistic concurrency |
| sort fields | — | ordering done via indexed columns + position |
| archived_at / deleted_at | INTEGER NULL | |
| created_at / updated_at | INTEGER | |
Indexes: (workspace_id, team_id, number), (workspace_id, updated_at), (assignee_id), (state_id), (project_id), (cycle_id), (milestone_id), (parent_id), (workspace_id, deleted_at), (workspace_id, priority), (workspace_id, due_date).

**issue_labels** — PK(issue_id, label_id); index (label_id). Both FK CASCADE.

**issue_relations**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | |
| issue_id | TEXT FK issues CASCADE | index |
| related_issue_id | TEXT FK issues CASCADE | index |
| type | TEXT CHECK IN ('related','blocked_by','blocking','duplicate') | inverse rows written for 'blocking' |
| created_by | TEXT FK users | |
| created_at | INTEGER | |
UNIQUE(issue_id, related_issue_id, type). Service rule: blocker resolution downgrades to 'related' (FM-016); 'duplicate' is terminal.

**issue_subscribers** — PK(issue_id, user_id); `reason TEXT CHECK IN ('created','assigned','mentioned','manual')`; created_at.

**issue_history** (property-change ledger)
| column | type |
|---|---|
| id | TEXT PK |
| workspace_id | TEXT FK CASCADE |
| issue_id | TEXT FK issues CASCADE — index (issue_id, created_at) |
| actor_id | TEXT NULL FK users | NULL = system |
| field | TEXT | title/description/state/priority/assignee/estimate/labels/relations/project/cycle/milestone/due_date/team |
| old_value / new_value | TEXT (json or scalar) |
| created_at | INTEGER |
Write rule: changes within 3 min of issue creation are folded into a single "created" entry (FM-019).

**issue_description_versions** — id PK, issue_id FK CASCADE (index), body_md TEXT, created_by FK users, created_at INTEGER. Snapshot on every description save (grace-window coalescing).

**undo_tokens** (FM-027 bulk compensating undo)
| column | type | notes |
|---|---|---|
| id | TEXT PK | opaque token returned by `POST /api/issues/bulk` |
| workspace_id | TEXT FK CASCADE | scoping predicate (§7) |
| actor_id | TEXT FK users CASCADE | member who issued the bulk |
| payload | TEXT NOT NULL | json snapshots of prior issue rows + labels |
| created_at | INTEGER | |
| consumed_at | INTEGER NULL | set by `POST /api/undo/:token`; reuse → 409 CONFLICT |

Undo is a compensating transaction: restore snapshotted fields, drop `issue_redirects` rows written by a `move_team` bulk, then mark the token consumed. Do not create this table at runtime — it is a migrated Drizzle table.

**attachments** — id PK, workspace_id, issue_id FK CASCADE (index), comment_id NULL FK comments, uploader_id FK users, kind CHECK ('link','file'), url TEXT, name TEXT, size_bytes INTEGER NULL, mime TEXT NULL, local_path TEXT NULL (under `data/uploads/<wsId>/`), created_at.

### 2.4 Projects, milestones, cycles

**projects**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index |
| name | TEXT NOT NULL | |
| description_md | TEXT | |
| status | TEXT NOT NULL DEFAULT 'backlog' CHECK IN ('backlog','planned','started','completed','canceled') | |
| lead_id | TEXT NULL FK users | single lead (FM-034) |
| target_start_date / target_end_date | TEXT NULL | |
| color | TEXT | |
| brief_page_id | TEXT NULL FK pages | project doc link |
| position | TEXT NOT NULL | |
| progress_cache | INTEGER NOT NULL DEFAULT 0 | materialized rounded percent 0–100, derived from `issuesDone`/`issuesTotal` below, maintained on issue writes (§9) |
| progress_points_cache | TEXT NULL | json {done, total, issuesDone, issuesTotal}. `done`/`total` stay estimate-weighted. `issuesDone`/`issuesTotal` hold live issue counts, stored so the counter can be incremented (§9) |
| archived_at / deleted_at / created_at / updated_at | INTEGER | |

**project_updates** — id PK, workspace_id, project_id FK CASCADE (index), author_id FK users, health CHECK ('on_track','at_risk','off_track'), body_md TEXT, progress_snapshot INTEGER, created_at. Reminder scheduling derived from projects.reminder_cadence? cadence lives on projects as `update_cadence TEXT CHECK ('off','daily','weekly','biweekly')` + `last_update_at` derived.

**milestones** — id PK, workspace_id, project_id FK CASCADE (index), name, target_date TEXT NULL, position TEXT, created_at, deleted_at. Completion derived (count of member issues started/completed).

**cycles**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | |
| team_id | TEXT FK CASCADE | UNIQUE(team_id, number), index (team_id, starts_at) |
| number | INTEGER NOT NULL | |
| name | TEXT NULL | default "Cycle N" |
| starts_at / ends_at | INTEGER NOT NULL | ms |
| status | TEXT NOT NULL CHECK IN ('future','active','completed') | derived+stored |
| closed_at | INTEGER NULL | |
| stats_snapshot | TEXT NULL | json: velocity counts/points, scope — frozen at close (FM-033) |
| created_at | INTEGER | |
Rollover (service job on ends_at): open cycle issues → next cycle; cycle marked completed; snapshot written.

### 2.5 Views

**views** (saved views; FM-025)
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index (workspace_id, scope) |
| owner_id | TEXT FK users | |
| scope | TEXT CHECK IN ('workspace','team','project') | workspace scope visible to all full members |
| team_id / project_id | TEXT NULL | for scoped views |
| name | TEXT NOT NULL | |
| layout | TEXT NOT NULL DEFAULT 'list' CHECK IN ('list','board','table') | |
| filters | TEXT NOT NULL | json filter AST (§4.2) |
| group_by | TEXT NULL | status/assignee/priority/label/project/cycle/team/none |
| sub_group_by | TEXT NULL | |
| order_by | TEXT NOT NULL DEFAULT 'created' | created/updated/status/priority/due/manual |
| order_dir | TEXT DEFAULT 'desc' | asc/desc; manual+reverse allowed (FM-024) |
| display | TEXT NOT NULL DEFAULT '{}' | json: visible properties, wrapping |
| position | TEXT | sidebar order |
| created_at / updated_at | INTEGER | |

**view_favorites** — PK(view_id, user_id). Personal layering (display overrides) stored client-side + in users prefs column? → personal display prefs per view in `view_user_prefs (view_id, user_id, display json, PK(view_id,user_id))`.

### 2.6 Pages & blocks

**pages**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index |
| parent_id | TEXT NULL FK pages CASCADE | root pages NULL |
| path | TEXT NOT NULL | materialized `/<parentPath>/<id>` for O(visible) subtree queries (§9) |
| title | TEXT NOT NULL DEFAULT '' | |
| icon | TEXT NULL | emoji |
| creator_id | TEXT FK users | |
| position | TEXT NOT NULL | fractional among siblings |
| depth | INTEGER NOT NULL DEFAULT 0 | cap 20 |
| is_published? | — | v1: no publishing (out of scope) |
| version | INTEGER NOT NULL DEFAULT 1 | |
| archived_at / deleted_at / created_at / updated_at / updated_by | INTEGER / TEXT | |
Indexes: (workspace_id, parent_id, position), (workspace_id, path).

**blocks**
| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid7 |
| workspace_id | TEXT FK CASCADE | scoping predicate |
| page_id | TEXT FK pages CASCADE | index (page_id, parent_id, position) |
| parent_id | TEXT NULL FK blocks CASCADE | nesting (children of list items, toggles, table cells rows) |
| type | TEXT NOT NULL CHECK (block_type) | enum §2.7 |
| props | TEXT NOT NULL DEFAULT '{}' | json per type (§2.7) |
| position | TEXT NOT NULL | fractional among siblings |
| text | TEXT NOT NULL DEFAULT '' | extracted plain text of the block (FTS + summaries; sanitized) |
| version | INTEGER DEFAULT 1 | |
| deleted_at | INTEGER NULL | soft delete (undo/restore windows) |
| created_by / updated_by | TEXT FK users | |
| created_at / updated_at | INTEGER | |

**Block type enum (19)** — `paragraph, heading_1, heading_2, heading_3, bulleted_list, numbered_list, todo, toggle, quote, callout, divider, code, image, file, bookmark, embed, table, issue_view, page_link`

**Block type → props contract**
| type | props (json) | children allowed |
|---|---|---|
| paragraph | {text: richText[], color?} | no (v1) |
| heading_1/2/3 | {text: richText[]} | no |
| bulleted_list / numbered_list | {text: richText[]} | yes (nested items) |
| todo | {text: richText[], checked: bool} | yes |
| toggle | {text: richText[], collapsed: bool} | yes |
| quote | {text: richText[]} | no |
| callout | {emoji, text} | no |
| divider | {} | no |
| code | {code, language, wrap: bool} | no |
| image | {url, caption?, file?{path,name,size,mime}} | no |
| file | {url, name, size?, mime?} | no |
| bookmark | {url, title, description, icon} (fetched server-side, size-capped) | no |
| embed | {url, provider, aspect?} | no |
| table | {rows: richText[][], headerRow: bool} — simple table, cells stored inline in props (no child blocks) | no |
| issue_view | {viewId: FK views, layout override?} | no (renders live view, FM-046) |
| page_link | {pageId, title, icon} | no |

richText[] = [{type: 'text', text, marks: {bold, italic, strike, code, link?} | {type:'mention', target: 'user'|'issue'|'page', id, label}}]. **Server-side sanitization: text nodes rendered as text, never innerHTML; link URLs scheme-validated (http/https/mailto only).**

### 2.7 Templates

**templates**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index (workspace_id, kind) |
| team_id | TEXT NULL FK teams | issue templates may be team-scoped |
| kind | TEXT CHECK ('issue','page') | |
| name / description | TEXT | |
| data | TEXT NOT NULL | json — issue: {title?, description_md?, priority?, state?, labels[], sub_issues[{title,…}]}; page: {icon?, blocks[{type, props, children[]}]} |
| position | TEXT | |
| recurrence | TEXT NULL | json {freq:'daily'|'weekly'|'monthly', every:int, next_run_at} (FM-054) |
| usage_count | INTEGER DEFAULT 0 | |
| created_by / created_at / updated_at | | |

### 2.8 Collaboration: comments, notifications, activity

**comments** — id PK, workspace_id, entity_type CHECK ('issue','page','project_update'), entity_id TEXT (index (entity_type, entity_id, created_at)), parent_id NULL FK comments CASCADE (threads), author_id FK users (only author may edit), body_md TEXT (mentions parsed to mentions table rows), resolved_at / resolved_by, created_at / updated_at / deleted_at.

**mentions** — id PK, workspace_id, comment_id FK CASCADE, target_user_id FK users, created_at. Drives notification generation; author warned if target lacks entity access (FM-055).

**notifications**
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index (workspace_id, user_id) |
| user_id | TEXT FK users CASCADE | index (user_id, read_at, created_at) |
| type | TEXT NOT NULL | issue_assigned, issue_mention, comment_added, issue_state_changed, issue_completed, issue_canceled, priority_urgent, issue_subscribed, project_update_posted, invite_accepted, ai_suggestion |
| entity_type / entity_id | TEXT | |
| actor_id | TEXT NULL FK users | |
| read_at | INTEGER NULL | |
| snoozed_until | INTEGER NULL | |
| deleted_at | INTEGER NULL | |
| created_at | INTEGER | |
No retention cap (FM-055).

**notification_prefs** — PK(workspace_id, user_id), prefs TEXT json: {type → {in_app: bool}} (FM-056).

**activity_events** — `id INTEGER PRIMARY KEY AUTOINCREMENT`, workspace_id (index (workspace_id, id)), actor_id NULL, actor_kind CHECK ('user','system','ai'), verb TEXT (e.g. issue.created, issue.state_changed, cycle.rolled_over, ai.suggested_label, ai.drafted_doc, member.invited), entity_type / entity_id, summary TEXT (human sentence), data TEXT json, created_at INTEGER. Index (entity_type, entity_id, id). This is the single audit ledger for user/system/AI actions (FM-057, FM-084).

### 2.9 Platform: events, presence, API keys, webhooks, AI runs, agent chat

**event_log** (SSE replay source)
| column | type | notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | = SSE event `id:` (Last-Event-ID semantics, §5) |
| workspace_id | TEXT FK CASCADE | index (workspace_id, id) |
| name | TEXT NOT NULL | event name §5 |
| entity_type / entity_id | TEXT | |
| payload | TEXT NOT NULL | json envelope |
| created_at | INTEGER | |
Retention: rows older than 7 days pruned (clients reconnecting after >7d fall back to full refetch).

**presence_sessions**
| column | type | notes |
|---|---|---|
| id | TEXT PK | SSE connection id |
| workspace_id | TEXT FK CASCADE | index (workspace_id, last_seen_at) |
| user_id | TEXT FK CASCADE | |
| viewing_type | TEXT NULL | issue/page/board/project/insights… |
| viewing_id | TEXT NULL | |
| connected_at / last_seen_at / disconnected_at | INTEGER | TTL: invisible if last_seen_at older than 15 s |

**api_keys** — id PK, workspace_id, user_id FK users (acts as this user), name, key_prefix TEXT (first 10 chars, display), key_hash TEXT UNIQUE (SHA-256 of `pmx_…` secret), scopes TEXT json (['read'] | ['read','write'] | granular e.g. 'issues:write'), created_by, created_at, last_used_at, revoked_at. (FM-074.)

**webhooks** — id PK, workspace_id, url TEXT (https enforced), secret TEXT (HMAC key, generated), events TEXT json (['issue.created', …] or ['*']), is_active INTEGER, created_by/created_at/updated_at.

**webhook_deliveries** — id PK, webhook_id FK CASCADE (index), event_name TEXT, payload TEXT, status CHECK ('pending','success','failed'), response_status INTEGER NULL, attempts INTEGER DEFAULT 0, next_retry_at INTEGER NULL, delivered_at INTEGER NULL, error TEXT NULL, created_at. Retry: exponential backoff 1m/5m/30m/2h/6h (5 attempts) → status 'failed' (dead-letter, manual redelivery button). (FM-076.)

**ai_runs** (transparency ledger, FM-084)
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index (workspace_id, feature, created_at) |
| user_id | TEXT NULL FK users | |
| feature | TEXT CHECK ('nlq','dedup','triage','summarize','ask','draft','related','hygiene','meeting','cluster','chat') | |
| engine | TEXT NOT NULL | 'local-deterministic' or 'provider:<id>:<model>' |
| input_hash | TEXT NOT NULL | SHA-256 of canonicalized input |
| duration_ms | INTEGER NOT NULL | |
| outcome | TEXT NOT NULL | json: result class + counts (suggestions made/accepted shown in usage page) |
| entity_type / entity_id | TEXT NULL | subject entity |
| created_at | INTEGER | |

**agent_conversations** (FM-073 dock sessions; T-013)
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| workspace_id | TEXT FK CASCADE | index (workspace_id, updated_at) |
| user_id | TEXT FK CASCADE users | owner of the thread (not shared across users in v1) |
| provider | TEXT NOT NULL | `local` \| `claude-code` \| `codex` |
| cli_session_id | TEXT NULL | CLI `--resume` token; null for local engine |
| context | TEXT NOT NULL | json: `{entityType?, entityId?, viewId?, label}` (chip source) |
| title | TEXT NOT NULL | first-turn stub, then model/local summary |
| created_at / updated_at | INTEGER | |
| archived_at | INTEGER NULL | hidden from session list, not deleted |

**agent_messages** (FM-073)
| column | type | notes |
|---|---|---|
| id | TEXT PK | |
| conversation_id | TEXT FK CASCADE agent_conversations | index (conversation_id, created_at) |
| role | TEXT CHECK ('user','assistant','system','tool') | |
| content_md | TEXT NOT NULL | |
| proposals | TEXT NULL | json array of `{method, path, body, label}` or null |
| ai_run_id | TEXT NULL FK ai_runs | assistant turns that ran an engine |
| created_at | INTEGER | |

### 2.10 Schemes: identifier allocation, positions, FTS5

**Identifier allocation (FM-013).** On issue create, inside one synchronous better-sqlite3 transaction: `UPDATE team_counters SET next_number = next_number + 1 WHERE team_id = ? RETURNING next_number` → number = returned − 1; `identifier = team.key || '-' || number`. Single-process sync driver ⇒ no gaps/races; `UNIQUE(workspace_id, identifier)` is the backstop. Team move: allocate new number in target team, write `issue_redirects (old_identifier TEXT PK, issue_id FK, workspace_id)` so old IDs/URLs resolve (30-day minimum, then kept until purge).

**Position / reordering — fractional indexing.** `position TEXT` keys over base-62 alphabet `[0-9a-zA-Z]`, lexicographic order = visual order.
- `midpoint(prev, next)`: common prefix, then insert midpoint char; used for drops between neighbors.
- Insert at end: `next(existing_last)`; at start: `prev(existing_first)`.
- Keys are unique ⇒ concurrent inserts converge without coordination (server assigns; client sends intent "after X before Y", server computes).
- If any sibling key exceeds 24 chars, rebalance all siblings to evenly spaced 12-char keys in one transaction (rare; amortized O(n)).
- Applies to: blocks, pages (siblings), states (within category), labels/groups, templates, projects, teams, issues.manual (per team), views (sidebar).

**Full-text search (FTS5).** One unified index (FM-042):
```sql
CREATE VIRTUAL TABLE search_fts USING fts5(
  title, body,
  entity_type UNINDEXED, entity_id UNINDEXED, workspace_id UNINDEXED,
  tokenize = 'porter unicode61'   -- CJK fallback: trigram aux tokenizer for CJK ranges
);
```
Maintained by service-layer write hooks (issue title/description/comment create-update, page title, block text create/update/delete). Content policy: issues (title + description + comments appended into body), pages (title + concatenated block `text`), projects (name). Query: `MATCH` with prefix `*`, quoted exact phrases; rank = bm25() + recency boost (updated_at bucket) + exact-title boost. Results grouped by entity_type, permission-filtered by the caller's scoping rule (§7).

---

## 3. API Surface (REST/JSON, `/api/**`)

**Conventions (binding)**
- Auth: session cookie (browser) **or** `Authorization: Bearer pmx_…` API key (FM-074/075). API-key requests are CSRF-exempt (no cookie) but rate-limited: **1,000 requests/hour/key** → `429` + `Retry-After: 60`; response headers `X-RateLimit-Limit / -Remaining / -Reset`. Session-cookie requests: CSRF token required on POST/PATCH/DELETE (`X-CSRF-Token` header, double-submit cookie pattern).
- Workspace selection: `?wsId=` param or the session's last-active workspace; **every** response entity is workspace-scoped server-side regardless (§7).
- Validation: zod schemas in `src/lib/validation/**`; failure → 400 (see error shape).
- **Error shape:** `{ "error": { "code": "VALIDATION", "message": "human summary", "details": [ …field errors or strings ] } }`
  Codes: `AUTH_REQUIRED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409 (version/version conflict, slug taken), `VALIDATION` 400, `RATE_LIMITED` 429, `PAYLOAD_TOO_LARGE` 413, `INTERNAL` 500. This code-to-status mapping is binding. `VALIDATION` is 400 on every route, including scope conflicts. 422 is not in the set and no route may return it.
- **Pagination:** cursor-based — `?limit=50&cursor=<opaque>`; response `{ "data": [...], "nextCursor": "…" | null }`. Cursors encode (sort_key, id) tuple, stable under inserts. List endpoints accept the shared filter params (§4.2).
- All mutating endpoints accept `?expectedVersion=` where the entity is versioned; mismatch → 409 CONFLICT (FM-090).

### 3.1 Auth & users (M1)
| Method | Path | Notes |
|---|---|---|
| POST | /api/auth/register | {email, password ≥ 10 chars, name} → session; rate-limited 10/h/IP |
| POST | /api/auth/login | {email, password}; generic error on failure; 10/min/IP |
| POST | /api/auth/logout | current session |
| POST | /api/auth/logout-all | revoke all user sessions |
| GET | /api/auth/session | current user + workspaces + csrf token |
| GET | /api/users/me | profile + preferences |
| PATCH | /api/users/me | name, avatar_seed, preferences |
| POST | /api/users/me/password | {current, next} |

### 3.2 Workspaces, members, invites (M1)
| Method | Path | Notes |
|---|---|---|
| GET | /api/workspaces | my memberships |
| POST | /api/workspaces | {name, slug?, timezone} → creator = owner |
| GET/PATCH/DELETE | /api/workspaces/:id | PATCH admin+; DELETE owner-only, type-to-confirm token |
| GET | /api/workspaces/:wsId/members | admin+ (members see roster minimal) |
| PATCH | /api/workspaces/:wsId/members/:userId | {role?, suspended?} admin+ (owner role: owner only) |
| DELETE | /api/workspaces/:wsId/members/:userId | admin+ (not self, not owner) |
| POST | /api/workspaces/:wsId/members/:userId/reset-password | admin sets temp password |
| GET/POST | /api/workspaces/:wsId/invites | POST {email, role, teamId?} → link+code (7-day expiry) |
| DELETE | /api/workspaces/:wsId/invites/:id | revoke |
| POST | /api/invites/accept | {code} → membership + session workspace switch |

### 3.3 Teams, states, labels (M1)
| Method | Path | Notes |
|---|---|---|
| GET/POST | /api/teams?wsId= | POST admin+ |
| GET/PATCH/DELETE | /api/teams/:id | PATCH admin+; DELETE requires empty issues (or cascade-confirm) |
| GET/POST | /api/teams/:id/states | reorder = PATCH batch |
| PATCH/DELETE | /api/states/:id | category minimum-1 enforced |
| GET/POST | /api/labels?wsId=&teamId= | |
| PATCH/DELETE | /api/labels/:id | DELETE removes from issues; archive keeps |

### 3.4 Issues, comments, views (M3)
| Method | Path | Notes |
|---|---|---|
| GET | /api/issues?wsId=&filters&sort&limit&cursor | shared filter AST (§4.2); grouping client-side over pages |
| POST | /api/issues | {teamId, title, stateId?, …}; returns identifier; runs dedup check (FM-063) as `suggestions` on response |
| GET/PATCH/DELETE | /api/issues/:id | PATCH per-field or partial; DELETE → trash (30 d) |
| POST | /api/issues/bulk | {ids[], action: 'state'|'assignee'|'labels'|'priority'|'archive'|'delete'|'move_team'|'cycle'|'project', value} → single undo token |
| POST | /api/undo/:token | compensating transaction (FM-027) |
| POST | /api/issues/:id/move-team | {teamId} → new identifier + redirect |
| POST/DELETE | /api/issues/:id/relations | {relatedIssueId, type} |
| POST/DELETE | /api/issues/:id/subscribers | {userId?, reason:'manual'} |
| GET | /api/issues/:id/history | property ledger (paged) |
| GET | /api/issues/:id/description-versions | list; POST restore |
| GET/POST | /api/issues/:id/comments | POST mentions parse → notifications |
| PATCH/DELETE | /api/comments/:id | author-only edit; resolve = PATCH {resolvedAt} |
| GET/POST | /api/views?wsId= | saved views (FM-025) |
| GET/PATCH/DELETE | /api/views/:id | owner or admin |
| POST | /api/views/:id/favorite | per-user |

### 3.5 Projects, milestones, cycles (M4)
| Method | Path | Notes |
|---|---|---|
| GET/POST | /api/projects?wsId= | |
| GET/PATCH/DELETE | /api/projects/:id | GET returns live progress + cached counters |
| GET/POST | /api/projects/:id/updates | health reports (FM-036) |
| DELETE | /api/project-updates/:id | author or admin |
| GET/POST | /api/projects/:id/milestones | |
| PATCH/DELETE | /api/milestones/:id | |
| GET | /api/cycles?wsId=&teamId= | with status + stats. Flat rather than team-scoped, because M4 owns `src/pages/api/cycles/**` and M1 owns `src/pages/api/teams/**` per §8, so a `/api/teams/:teamId/cycles` path would straddle two modules permanently |
| POST | /api/cycles | {teamId, number?} (scheduler also auto-creates) |
| PATCH | /api/cycles/:id | surgery: dates, end-early (FM-032) |
| POST | /api/cycles/:id/scope | {add[], remove[]} |
| POST | /api/cycles/:id/close | rollover + snapshot (FM-031/033) |

### 3.6 Pages, blocks, templates, search (M5 + M1 search)
| Method | Path | Notes |
|---|---|---|
| GET | /api/workspaces/:wsId/pages/tree | sidebar tree (visible nodes only, path-indexed) |
| GET/POST | /api/pages?wsId= | POST {parentId?, title} |
| GET/PATCH/DELETE | /api/pages/:id | DELETE → 30-d trash; restore = POST /api/pages/:id/restore |
| GET | /api/pages/:pageId/blocks | **single query** (page_id index) returning full ordered tree |
| POST | /api/pages/:pageId/blocks | {type, props, afterId?|beforeId?|parentId?} server assigns position |
| PATCH | /api/blocks/:id | {props?, afterId?…} |
| DELETE | /api/blocks/:id | soft delete |
| POST | /api/pages/:pageId/blocks/batch | batch: [{op:'insert'|'move'|'update'|'delete', …}] one transaction (paste, drag multi) |
| GET/POST | /api/templates?wsId=&kind= | |
| PATCH/DELETE | /api/templates/:id | |
| POST | /api/templates/:id/instantiate | issue → new issue; page → new page with block clone |
| GET | /api/search?q=&types=issue,page,project,comment | FTS5 unified (FM-042) |

### 3.7 Notifications, activity, SSE, presence (M8)
| Method | Path | Notes |
|---|---|---|
| GET | /api/notifications?wsId=&unread=true&cursor | inbox feed (FM-055) |
| POST | /api/notifications/read | {ids[] | all:true} |
| POST | /api/notifications/:id/snooze | {until} |
| DELETE | /api/notifications/:id | |
| GET/PUT | /api/notifications/prefs | per-type prefs (FM-056) |
| GET | /api/activity?wsId=&actor=&entity=&cursor | workspace ledger (FM-057) |
| GET | /api/events | **SSE stream** (§5) — session auth only |
| POST | /api/presence | {viewing:{type,id}} heartbeat 5 s |
| GET | /api/presence?wsId=&entity=&id= | roster for an entity |

### 3.8 AI (M6)
| Method | Path | Notes |
|---|---|---|
| POST | /api/ai/nlq | {text} → filter AST (chips) (FM-062) |
| POST | /api/ai/dedup/check | {teamId, title, description} → candidates [{issueId, score, sharedTerms}] (FM-063) |
| POST | /api/ai/triage/suggest | {issueId} → {labels[], priority?, assignee?, why[]} (FM-064) |
| POST | /api/ai/summarize | {entityType, entityId} → {sentences[{text, sourceRef}]} (FM-065) |
| POST | /api/ai/ask | {question} → {answer sentences w/ citations, confidence, engine} (FM-066) |
| POST | /api/ai/draft | {kind:'prd'|'story'|'spec', fromIssueId|fromProjectId} → proposal doc (FM-067) |
| GET | /api/ai/related?entity=&id= | related content panel (FM-068) |
| POST | /api/ai/hygiene/run | {teamId} → digest {items[]} ; POST /api/ai/hygiene/apply {digestId, itemIds[]} (FM-069) |
| POST | /api/ai/meeting/extract | {notesMd} → action-item drafts (review tray) (FM-070) |
| GET | /api/ai/clusters?teamId= | open-issue clusters (FM-071) |
| GET | /api/ai/chat/conversations | list current user's non-archived threads (FM-073) |
| POST | /api/ai/chat/conversations | {provider?, context?, title?} → conversation |
| GET | /api/ai/chat/conversations/:id | thread + messages; 404 if other user / other workspace |
| DELETE | /api/ai/chat/conversations/:id | archive (sets archived_at); hard-delete is out of scope |
| POST | /api/ai/chat/conversations/:id/messages | {contentMd} → `text/event-stream` (`chat-delta` / `done` / `error`). **Not** M8 EventSource. (FM-073) |
| GET/PATCH | /api/settings/ai | per-workspace `{chatProvider, model, cliPath, toolAllowlist}` (FM-073/084) |
| GET | /api/ai/usage | per-feature stats from ai_runs (FM-084) |

### 3.9 Insights, import/export, keys, webhooks, settings (M7/M9/M10)
| Method | Path | Notes |
|---|---|---|
| GET | /api/insights/velocity?wsId=&teamId=&cycleRange | |
| GET | /api/insights/burnup?wsId=&projectId=&granularity | |
| GET | /api/insights/created-vs-completed?wsId=&teamId= | |
| GET | /api/insights/breakdown?wsId=&dimension=&segment | click-through returns filter for /api/issues |
| POST | /api/import/csv | multipart; step=dry|commit (FM-078) |
| GET | /api/export/issues.csv?wsId=&filters | respects saved view filters |
| POST | /api/export/pages | {format:'md'|'html', pageIds[]} |
| POST | /api/import/markdown | creates page(s) from md (FM-079) |
| GET/POST | /api/keys | API key create returns secret once |
| DELETE | /api/keys/:id | revoke |
| GET/POST | /api/webhooks | |
| PATCH/DELETE | /api/webhooks/:id | |
| GET | /api/webhooks/:id/deliveries | paged ledger |
| POST | /api/webhooks/:id/test | ping + manual redeliver {deliveryId} |
| GET/PATCH | /api/settings/workspace?wsId= | FM-082 |
| GET/PATCH | /api/settings/teams/:teamId | FM-083 |

**Endpoint count: ~101** across 9 groups.

---

## 4. Filter DSL & Querying (shared M1/M3 contract)

### 4.1 SSE payload envelope (defined here, used §5)
```json
{ "v": 1, "ws": "ws_x", "entity": "issue", "id": "iss_y",
  "version": 17, "actor": { "id": "usr_z", "kind": "user" },
  "ts": 1755300000000, "patch": { "stateId": "st_3", "completedAt": 1755300000000 } }
```

### 4.2 Filter AST (FM-021/022, FM-062 target format)
```ts
type Filter = { field: 'team'|'status'|'statusCategory'|'assignee'|'creator'|'priority'|'label'|'project'|'milestone'|'cycle'|'dueDate'|'estimate'|'created'|'updated'|'identifier',
                op: 'eq'|'neq'|'in'|'nin'|'includesAny'|'includesAll'|'excludes'|'before'|'after'|'withinLast',
                value: string | number | string[] | {days:number} }
type FilterGroup = { combinator: 'and'|'or', children: (Filter | FilterGroup)[], not?: boolean } // max depth 3
```
Compiled server-side to parameterized SQL (Drizzle `sql` fragments) — **never** string interpolation (AT-103). The NL→filter AI feature (FM-062) emits exactly this AST, which the UI renders as editable chips before applying.

---

## 5. SSE Design (M8)

**Endpoint:** `GET /api/events?wsId=<id>` (EventSource; session cookie auth; one connection per tab). Response `text/event-stream`, no buffering.

**Event names & payloads** (envelope §4.1; `patch` carries changed fields or null for pure-invalidations):

| Event name | Fired when | patch contents |
|---|---|---|
| `hello` | on connect | {lastEventId, workspaceId, serverTime} |
| `issue.created` / `issue.updated` / `issue.deleted` | issue writes | full entity on created; changed fields on updated |
| `issue.moved` | team move | {oldIdentifier, newIdentifier, teamId} |
| `comment.created` | issue/page comments | {entityType, entityId, commentId} |
| `page.updated` | page meta/title/position | changed fields |
| `block.updated` | any block write (batch = one event per block, coalesced ≤50 ms) | {pageId, blockId, type, props, position, version} |
| `view.updated` | saved view edits | changed fields |
| `notification.created` | recipient-only event (targeted connection) | notification row |
| `activity.created` | any activity_events append | {verb, entityType, entityId, summary} |
| `presence.ping` / `presence.leave` | presence heartbeat changes / disconnect | {userId, viewing} roster deltas |
| `cycle.rolled` | rollover job | {teamId, fromCycleId, toCycleId} |
| `project.updated` | project writes | changed fields |
| `ping` | heartbeat every 25 s | comment-line keepalive (`: ping`) |

**Reconnect & replay.** Every event's SSE `id:` = `event_log.id` (AUTOINCREMENT). Browser EventSource auto-reconnects; server honors `Last-Event-ID: N` by replaying all rows for that workspace with `id > N` (ordered), then live-follows. If `Last-Event-ID` is missing/stale beyond the 7-day retention, server sends `event: resync` and the client refetches visible queries (documented fallback). Optimistic UI (FM-090): mutations apply locally, reconcile on HTTP response; incoming SSE patches with `version > local` win; a patch arriving between edit-start and edit-save with conflicting field → 409/patch conflict → non-destructive conflict toast.

**Presence heartbeat.** Client `POST /api/presence` every 5 s with current `{viewing:{type,id}}` (piggybacked on SSE connection id); server updates `presence_sessions.last_seen_at`, broadcasts `presence.ping` **only when the roster changed** (join/leave/move). Roster TTL 15 s; disconnect (SSE close) marks `disconnected_at` and broadcasts `presence.leave`. Presence is best-effort — loss never affects correctness.

---

## 6. AI Layer (M6, `src/lib/ai/`)

### 6.1 Provider interface

```ts
type AIFeature = 'nlq'|'dedup'|'triage'|'summarize'|'ask'|'draft'|'related'|'hygiene'|'meeting'|'cluster'|'chat';

interface AIProvider {
  id: string;                       // 'local' | 'openai' | 'anthropic' | …
  label: string;                    // shown on every artifact ("Local engine" / "GPT-x via owner key")
  capabilities: AIFeature[];
  invoke<F extends AIFeature>(req: AIRequest<F>): Promise<AIResult<F>>;
}

// Typed feature contracts (all providers must satisfy the SAME contract):
type AIRequest = {
  nlq:       { workspaceId, userId, text: string };
  dedup:     { workspaceId, teamId, title: string, description: string };
  triage:    { workspaceId, issueId };
  summarize: { workspaceId, entityType: 'issue'|'thread'|'project', entityId };
  ask:       { workspaceId, userId, question: string };
  draft:     { workspaceId, kind: 'prd'|'story'|'spec', source: {issueId?|projectId?} };
  related:   { workspaceId, entityType, entityId };
  hygiene:   { workspaceId, teamId };
  meeting:   { workspaceId, notesMd };
  cluster:   { workspaceId, teamId };
  chat:      { workspaceId, userId, messages: {role,content}[] };
};
```
Every endpoint wraps `invoke` with: workspace scoping (retrieval only within caller's scope), `ai_runs` logging (feature, engine, input_hash, duration, outcome), and result annotation `{engine, engineLabel, asOf}`. **Features never branch on engine** — the deterministic engine is provider #0 and always registered first; env-configured HTTP providers (BYOK: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`) are appended; **local CLI agent providers are a separate class** (§6.5) and are never configured via M9 API keys. Routing preference is per-workspace setting with per-conversation token/latency budgets (FM-073).

### 6.2 Deterministic implementations (all offline, no network)

| Feature | Algorithm | Notes |
|---|---|---|
| nlq (FM-062) | Controlled-vocabulary parser: tokenizer → entity gazetteer (team keys, label names, usernames, status/priority words, date phrases) → filter AST; ambiguity → returns clarifying chips, never guesses silently | Parse ALWAYS rendered as chips before apply |
| dedup (FM-063) | Char-trigram shingles → MinHash (128 perms) + LSH bands (16×8) over open+recent (≤90 d) issues → candidates verified by true Jaccard; exact stack-trace SHA-256 match short-circuits; SimHash fingerprint stored for near-exact | Banner shows % + shared terms; propose-only |
| triage (FM-064) | Rule engine (regex/keyword/stack-trace-present rules per workspace, seeded defaults) + kNN (k=5) over TF-IDF of historically labeled issues + severity lexicon (crash/data-loss/regression…) → scored suggestions with matched-rule trace; accept/reject feedback stored (`triage_feedback` table) adjusts kNN weights | Suggestion-only until per-workspace opt-in (precision threshold) |
| summarize (FM-065) | TextRank: sentence split → BM25 sentence-similarity graph → PageRank → top-k; each output sentence carries sourceRef (comment id/block id) | Extractive ⇒ can only quote |
| ask (FM-066) | FTS5 retrieval (top 8 chunks) → sentence re-rank → answer = cited extractive sentences; confidence = retrieval score; below threshold → explicit "no confident match" | Retrieved text is data, never instructions |
| draft (FM-067) | Template engine: section templates filled from structured fields (labels, relations, linked issues, TextRank extracts, cluster stats); every entity reference validated against workspace schema — unknown → unlinked plain text | Proposal/diff mode only; "as of" stamp |
| related (FM-068) | TF-IDF cosine over entity text vs FTS candidates; shared-term highlights; age decay; threshold exposed in settings | Passive panel, opt-out |
| hygiene (FM-069) | Deterministic staleness rules (no activity N days, unassigned, unlinked, dedup-cluster members) → itemized digest; apply is itemized + undo-token; weekly run cap | Never bulk-mutates without explicit apply |
| meeting (FM-070) | Date/person/task regex + cue-verb patterns ("will", "owns", "follow up", "by Friday") → action-item drafts in review tray; entities validated against members/projects | Unknown entities stay unlinked |
| cluster (FM-071) | Agglomerative clustering over TF-IDF vectors of open issues; cohesion score; shared-term extraction for "common requirements" | Editable memberships; never auto-creates projects |

### 6.3 Upgrade path (LLM providers)
Providers implement the same `AIProvider` interface; recommended shape mirrors OpenAI-compatible chat/completions with tool calls (industry-converged surface, per R3 §7). Provider responses pass the SAME post-processing as local results: entity validation, citation requirement for ask/summarize, `ai_runs` logging with model label, per-conversation token budget, and spend-ceiling alert. Degradation rule: provider missing/rate-limited/erroring → route back to local engine and label the result accordingly (never an error to the user).

### 6.4 Prompt-injection & safety defenses (binding)
1. Deterministic engine is structurally immune (no instruction channel) — it is the default for all automated/background surfaces.
2. When a provider is enabled: retrieved issue/doc text is quarantined as data (delimited, never concatenated into instruction roles).
3. **No tool side-effects without review** — AI may compute and propose; writes happen only via the same REST endpoints the user would use, under the invoking user's role (FM-081), and destructive/bulk proposals require explicit itemized human apply.
4. Output entity validation: every assignee/project/label/id in AI output checked against workspace schema; unknowns render as unlinked text (never auto-created).
5. Input hardening: length caps (10k chars to NLQ/ask), unicode normalization (NFKC), zero-width/control-character stripping, per-run timeout with fallback-to-no-suggestion (triage never crashes the inbox).
6. Loop caps: any automation-ish feature (hygiene apply) is run-capped and dry-run-gated.

### 6.5 Local CLI agent providers

Provider #0 remains the offline deterministic engine (§6.2). A workspace may also attach **local CLI agent providers** spawned as subprocesses under the signed-in user's own CLI auth. They are **never** reachable via M9 API keys and are **not** BYOK env providers (`AI_API_KEY`). Code lands in T-013/T-014.

**Registered providers (binding order)**
1. `local` — deterministic engine; always present; degradation target.
2. `claude-code` — first CLI provider. Spawn the user's `claude` binary (or `cliPath` override) headless with `stream-json` and `--resume` when `agent_conversations.cli_session_id` is set.
3. `codex` — same seam (spawn, stream, resume, proposals). May ship after `claude-code`; contracts are identical.

**Chat transport.** `POST /api/ai/chat/conversations/:id/messages` responds `text/event-stream` with events `chat-delta`, `done`, and `error`. This stream is **not** M8's workspace EventSource (`GET /api/events`); mixing them is a spec violation. Conversation CRUD: `POST/GET /api/ai/chat/conversations`, `GET/DELETE /api/ai/chat/conversations/:id`. Settings: `GET/PATCH /api/settings/ai` (`chatProvider`, `model`, `cliPath` overrides, tool allowlist).

**Safety invariants (binding)**
- Arg allowlist only (`stream-json`, `--resume`, model, documented output flags). User text is stdin/payload, never interpolated into argv.
- Hard timeout per turn; killed process → `error` event, then degrade to local.
- Output caps (bytes and event count); overflow → stop + `error`.
- `ai_runs.engine` for CLI turns is `provider:claude-code:<model>` or `provider:codex:<model>`.

**Proposals.** Assistant messages may include `proposals`: validated endpoint-call shapes `{method, path, body, label}`. The dock renders each as an itemized Apply card. Apply runs **under the user's session via the same REST endpoints** the human would call. **No server-side replay of stored requests.** Undo uses the endpoint's undo token when one exists.

**Degradation.** CLI missing, not installed, auth-expired, timeout, or non-zero exit → complete the turn on provider #0 and label it (`Local engine` + reason). The dock never blanks.

---

## 7. Permissions Model

**Row-level scoping rule (binding):** every service-layer query for a workspace-scoped entity includes `WHERE workspace_id = :wsId` where `:wsId` comes from the server-side session/API-key resolution — never from client payload alone. Guests additionally get `entity.team_id IN (user's team_members teams)` for team-scoped entities (issues, boards, cycles) and **no Docs access** in v1 (pages/blocks API returns 403 for guests). This rule is enforced by a Drizzle query helper (`scopedQuery(wsCtx, table)`) that all services must use; raw db access is lint-blocked outside `src/lib/services`.

**Capability matrix** (✓ allowed, – denied; enforcement in service layer + mirrored in UI affordances; API/webhooks/AI inherit the same matrix):

| Action | Owner | Admin | Member | Guest |
|---|---|---|---|---|
| Workspace settings (name/slug/timezone) | ✓ | ✓ | – | – |
| Delete workspace / transfer ownership | ✓ | – | – | – |
| Invite members; revoke invites | ✓ | ✓ | – | – |
| Change roles / suspend / remove members | ✓ | ✓ (not on owner) | – | – |
| Admin-set password reset | ✓ | ✓ | – | – |
| Create/update/delete teams | ✓ | ✓ | – | – |
| Manage workflow states, workspace labels | ✓ | ✓ | – | – |
| Team settings (cycles, triage, estimates, auto-archive) | ✓ | ✓ | – | – |
| Create/edit issues in accessible teams | ✓ | ✓ | ✓ | ✓ (team-scoped) |
| Delete/trash issues | ✓ | ✓ | ✓ (team-scoped) | ✓ (team-scoped) |
| Bulk operations + undo | ✓ | ✓ | ✓ (team-scoped) | ✓ (team-scoped) |
| Create/edit/delete pages & blocks (Docs) | ✓ | ✓ | ✓ | – |
| Create/manage saved views (workspace scope) | ✓ | ✓ | ✓ | – |
| Personal-scope views | ✓ | ✓ | ✓ | ✓ (issue views) |
| Manage projects/milestones | ✓ | ✓ | ✓ | – |
| Project updates (post) | ✓ | ✓ | ✓ | – |
| Manage cycles (scope, surgery, close) | ✓ | ✓ | ✓ | – |
| Insights | ✓ | ✓ | ✓ | – |
| AI features | ✓ | ✓ | ✓ | – |
| Templates (create/edit) | ✓ | ✓ | ✓ (team scope) | – |
| API keys, webhooks, CSV import/export | ✓ | ✓ | – | – |
| Notifications/prefs (own) | ✓ | ✓ | ✓ | ✓ |

Ownership of an entity (creator, project lead, view owner) grants edit on that entity within the role's reach; only the comment author may edit a comment; anyone with edit rights may edit issue title/description (Linear parity).

---

## 8. Module Boundaries (M0–M10) — exclusive directory ownership

Shared constraints (binding, authored in M0/M1): `src/lib/constants.ts` (SSE event names §5, error codes §3, block type enum §2.6, role names), `src/lib/errors.ts` shape, zod conventions, Drizzle naming. Amendments require the integration checkpoint.

| Module | Exclusively owns | Key deliverables (FM refs) |
|---|---|---|
| **M0 Foundation** | `package.json`, `astro.config.*`, `tsconfig.json`, `tailwind/postcss` config, `drizzle.config.ts`, `.env.example`, `src/styles/**`, `src/middleware/**` (auth/CSRF/rate-limit skeleton), `src/lib/constants.ts`, `src/pages/index.astro`, `src/pages/[...app].astro` (island mount), `scripts/**` | App boots; check/test/e2e/build scripts; theming tokens (FM-085 basis) |
| **M1 Data & API core** | `src/db/**` (schema, migrations, seed, fts), `src/lib/{errors.ts,auth,crypto,scoping}.ts`, `src/lib/validation/**`, `src/lib/services/**` (all), `src/lib/events/**` (bus + event_log writer), `src/pages/api/{auth,users,workspaces,members,invites,teams,states,labels,search}/**` | Schema §2 + migrations + seed; auth FM-001..003; workspace/team/label endpoints; scopedQuery rule |
| **M2 App shell** | `src/app/**` (island entry, router, global stores), `src/components/shell/**`, `src/lib/keyboard/**`, `src/lib/theme/**` | Shell, sidebar, command palette FM-041, shortcuts FM-028, theme FM-085, toasts |
| **M3 Issues engine** | `src/pages/api/{issues,comments,views}/**`, `src/features/issues/**`, `src/components/issues/**` | FM-012..020, FM-021..027, FM-029, FM-038..040 (triage UI) |
| **M4 Projects & cycles** | `src/pages/api/{projects,project-updates,milestones,cycles}/**`, `src/features/projects/**` | FM-030..037 |
| **M5 Docs engine** | `src/pages/api/{pages,blocks,templates}/**`, `src/features/docs/**`, `src/components/blocks/**` | FM-044..054, FM-079 (md import/export) |
| **M6 AI layer** | `src/lib/ai/**`, `src/pages/api/ai/**`, `src/components/ai/**`, `src/pages/api/settings/ai*` (chat provider; exception vs M10) | FM-062..073, ai_runs ledger writes, agent chat (§6.5) |
| **M7 Insights** | `src/pages/api/insights/**`, `src/features/insights/**` | FM-058..061 |
| **M8 Realtime** | `src/pages/api/{events,presence,notifications,activity}/**`, `src/lib/sse/**`, `src/features/{realtime,inbox,activity}/**` | FM-055..057, FM-088..090; event_log reader |
| **M9 Integrations** | `src/pages/api/{keys,webhooks,import,export}/**`, `src/lib/webhooks/**`, `src/features/integrations/**` | FM-074..078; webhook dispatcher subscribes to M1 bus |
| **M10 Settings & admin** | `src/pages/api/settings/**` except `settings/ai*` (M6), `src/features/settings/**` | FM-008 UI, FM-082..084 |

Overlap rule: a module needing a change inside another module's ownership files a constraint amendment at the integration checkpoint — it never edits the file directly.

Recorded amendment, 2026-08-19, M1 to M4 (T-022). The T-005 remediation may edit the M1-owned files `src/lib/services/issues-events.ts`, `issues-update.ts`, `issues.ts`, `issues-bulk.ts`, and `issues-history.ts`. T-002 completed those services and no other ticket owns them today. The reason is the defect being fixed. T-005 avoided crossing this boundary by registering its progress consumer as an import side effect, and nothing on the issue-write path imports that module, so the hook is never armed in production. The workaround is the bug. Scope is the T-005 remediation plan only, and T-005's `owns:` line carries the same five files.

Recorded amendment, 2026-08-19, verification tooling. The T-005 remediation adds
`scripts/gates.mjs`, an M0-owned path, and `.github/workflows/gates.yml`, which
§8 assigns to nobody. The reason is that every gate failure this project shipped
got reported as green, and the mechanism was a shell pipeline discarding the
exit code. A runner that keeps exit codes and a CI job that runs it take every
summary out of the trust path. `.github/**` is an ownership gap in this table
and should be assigned to M0 at the next integration checkpoint.

---

## 9. Performance Counter-Designs (vs Notion's documented root causes)

| Notion root cause (R2 §12) | Prodmax counter-design | Budget / proof |
|---|---|---|
| Block bloat: every line = a hydrated record; pages open via recursive `loadPageChunk` crawls | Page open = **one** `SELECT … WHERE page_id = ? AND deleted_at IS NULL ORDER BY parent_id, position` over the (page_id, parent_id, position) index; client builds the tree; no recursion, no N+1 | 5,000-block page open < 150 ms server time (AT-113 class) |
| Search is server-side + permission-filtered per keystroke (6–10 s reported) | FTS5 local index (§2.10) with bm25 ranking; permission filter is a WHERE on scoped query; debounce 150 ms | < 100 ms query at 100k docs/issues (AT-062) |
| Derived values (formulas/rollups/linked views) recompute on every load | **Incremental materialized counters.** The issue mutation event carries before-state and after-state. The consumer reads the delta off the event and applies increments to `projects.progress_cache` and `progress_points_cache` in the same service write. No write path recomputes a counter from the issue rows. A full recompute exists only as a named repair and backfill entry point, used for reconciliation and for self-healing a stale row on first touch, and it never runs on the write path. Cycle `stats_snapshot` frozen at close. View counts computed per page from cursor data, no load-time recompute | Insights/progress reads never scan issues at render; counter update is O(1) per write |
| Cloud round-trip per transaction; keystroke batches POST | Optimistic UI + SSE deltas (§5): edits render instantly, reconcile async; no saveTransaction on paint | Property edit round-trip invisible; board drag never blocks |
| Deep page-tree sidebar sprawl | `pages.path` materialized path + depth; sidebar renders visible nodes only; favorites/recents above tree | Sidebar O(expanded nodes) |
| Dashboards (many inline DBs) are slowest pages | `issue_view` blocks embed a saved view; data arrives via the same cursor endpoint + SSE patches, virtualized rows (react-window class), 50/page | Embedded view with 10k issues stays < 16 ms/frame (AT-113) |
| AI payloads degrade core app ("too slow after AI") | AI is async and never blocks mutation paths; dedup/triage compute on the write path is capped (< 50 ms) or deferred to `suggestions` payload; everything cached (MinHash fingerprints, TF-IDF vectors persisted) | Core interactions unaffected when AI runs |
| API recursion (DB→page→block) vs 3 req/s | Flat REST with batch endpoints (`/blocks/batch`, `/issues/bulk`); 1,000 req/h/key with burst-friendly cursor paging | Bulk import of 1k issues ≤ 5 API calls |

**SQLite pragmas (binding):** WAL mode, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`. Migrations are Drizzle-generated, forward-only, committed with the module that owns the table.
