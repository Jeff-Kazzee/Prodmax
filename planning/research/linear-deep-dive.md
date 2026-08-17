# Linear Deep Dive — Competitive Research for Prodmax

**Research agent:** R1 | **Date compiled:** 2026-08-16 | **Scope:** Linear (linear.app) as of 2026
**Purpose:** Exhaustive factual reference so Prodmax can match Linear's valuable functionality with original code/branding while improving its weaknesses. All findings below are behavioral facts about Linear, not specifications to copy verbatim.

**Primary sources:** Linear docs (linear.app/docs), Linear developers (linear.app/developers), Linear Now/changelog (linear.app/now), Linear pricing (linear.app/pricing), Linear keynote (linear.app/next), G2, Capterra, Reddit (r/Linear, r/ProductManagement), fastshortcuts.com, get-alfred.ai, usecarly.com. 25+ distinct sources cited inline.

---

## 1. Core Objects & Data Model

**Hierarchy: Workspace → Teams → Issues/Projects → (optionally) Cycles, Milestones; Initiatives span the top.**

- **Workspace** = organization; made of one or more **teams** "which typically represent groups of people who work together frequently." A default team is auto-created with the workspace. Suggested groupings: frequent collaborators, work areas (marketing, mobile), or one team for everyone. ([docs/teams](https://linear.app/docs/teams))
- **Team limits by plan:** Free = 2 teams, Basic = 5 teams, Business/Enterprise = unlimited. Private teams are Business/Enterprise only. ([docs/teams](https://linear.app/docs/teams))
- **Issues** always belong to exactly one team, have a human-readable ID (team identifier + unique number, e.g. `ENG-123`), and require only a title and status — everything else optional. ([docs/creating-issues](https://linear.app/docs/creating-issues))
- **Workflow states (statuses)** are team-specific, with a default sequence Backlog → Todo → In Progress → Done → Canceled. Status **categories** are fixed: Backlog, Unstarted (Todo), Started (In Progress/In Review), Completed, Canceled, plus **Triage** (opt-in team inbox category) and a system-managed **Duplicate** status (cannot be renamed). Statuses can be reordered only within a category; each category must retain at least one status. The first Backlog status is the default for new issues (changeable). Linear's own team uses: Backlog (Icebox, Backlog), Todo, In Progress/In Review/Ready to Merge, Done, Canceled/Could not reproduce/Won't Fix, Duplicate. ([docs/configuring-workflows](https://linear.app/docs/configuring-workflows))
- **Projects** = units "with a clear outcome or planned completion date," made of issues + optional documents; can span multiple teams. Single **project lead** field ("to keep ownership of the project clear"). An issue belongs to only one project at a time. Project statuses are customizable under the same category set as issues (Backlog/Planned/Started/Completed/Canceled) per [changelog 2024-03-19](https://linear.app/changelog/2024-03-19-custom-statuses-for-projects); a custom "Maintenance" status pattern is common for long-lived work. ([docs/projects](https://linear.app/docs/projects))
- **Cycles** = team-specific timeboxes (see §4). Sub-teams inherit the parent team's cycle schedule.
- **Labels** exist at **workspace level** (every team) or **team level**; sub-teams inherit parent labels. **Label groups** add one nesting level (up to 250 labels/group); only one label per group can apply to an issue; groups created with `Group/Label` syntax. Reserved label names include "assignee", "cycle", "priority", "project", "state", "status". Same-named team labels aggregate in multi-team views (but not in the API, which needs unique IDs). Label **archive** keeps it on existing issues but blocks new use; **delete** is permanent and removes it from all issues. ([docs/labels](https://linear.app/docs/labels))
- **Priority** is optional: No priority, Low, Medium, High, Urgent. ([docs/priority](https://linear.app/docs/priority) via search)
- **Estimates** are opt-in per team; scales: Exponential (1,2,4,8,16), Fibonacci (1,2,3,5,8), Linear (1–5), T-shirt (XS–XL); "extended scale" adds two values (e.g. XXL/XXXL; Fibonacci 13/21). T-shirt sizes map to Fibonacci numbers for graphs (XS=1, S=2, M=3, L=5, XL=8, XXL=13, XXXL=21 per [docs/creating-issues](https://linear.app/docs/creating-issues)). Teams may allow explicit 0 estimates; unestimated issues count as 1 point by default (can be disabled). ([docs/estimates](https://linear.app/docs/estimates))
- **Relations:** four types — related, blocked by, blocking, duplicate. Unlimited relations of each type. Referencing an issue in a description/comment auto-creates a "related" relation. When a blocking issue resolves, the relation shifts to "Related." ([docs/issue-relations](https://linear.app/docs/issue-relations))
- **Duplicate** is both a relation and a workflow outcome: merging a duplicate moves it into the reserved Duplicate status, transfers attachments/customer requests to the canonical issue, and links back with a dedicated banner. Direction is one-way (initiated from the duplicate). ([docs/issue-relations](https://linear.app/docs/issue-relations), [docs/triage](https://linear.app/docs/triage))
- **Parent/sub-issues:** sub-issues inherit parent's team, priority, project (cycle if in active status); labels NOT inherited; assignee carries over conditionally. Parent auto-close and sub-issue auto-close automations are toggleable in team workflow settings. ([docs/parent-and-sub-issues](https://linear.app/docs/parent-and-sub-issues))
- **Assignees/subscribers:** auto-subscribe on create/assign/@mention; manual subscribe via Shift+S. Sub-issue assignee heuristics described above. ([docs/notifications](https://linear.app/docs/notifications))
- **Attachments:** files on comments (paperclip, Cmd+Shift+A, drag-drop); linked PRs, Slack threads, Figma previews, Sentry/Zendesk/Intercom/Front links appear as attachments on the issue. ([docs/comment-on-issues](https://linear.app/docs/comment-on-issues), [docs/github](https://linear.app/docs/github))
- **Initiatives** (formerly Roadmaps) group projects around company objectives; properties: Status (Proposed/Planned/Active/Completed/Canceled), Priority, Labels (workspace-managed), Owner (single accountable person), Lead team, Target date, Resources. Health rolls up from latest project update (green on track / yellow at risk / red off track / gray no update). Visible to all members except guests. ([docs/initiatives](https://linear.app/docs/initiatives))
- **Milestones** live inside projects (see §4). **Roadmap** = the Initiative timeline view; "Roadmaps have been renamed to Initiatives." ([docs/projects](https://linear.app/docs/projects))

## 2. Issue Workflows

- **Creation entry points:** `C` opens the new-issue modal, `V` full-screen editor, `Option/Alt+C` template picker; upper-left create icon; `linear.new` / `linear.app/new` / `linear.app/team/<id>/new` URLs with prefill query params (title, description, status, team, priority, assignee, estimate, cycle, label, project, milestone, links, template); GraphQL API; integrations; highlighted text prefills title. ([docs/creating-issues](https://linear.app/docs/creating-issues))
- **3-minute rule:** property edits within 3 minutes of creation count as part of creation and do NOT appear in the activity log. ([docs/creating-issues](https://linear.app/docs/creating-issues))
- **Drafts:** navigating away keeps a local draft (cleared on logout/restart); Esc offers to save a persistent draft in sidebar Drafts, stored 6 months then auto-deleted. ([docs/creating-issues](https://linear.app/docs/creating-issues))
- **Email intake:** team intake address, per-template address, or Linear Asks (synced replies, custom domains); original email attached; attachments capped 25 MB; body under 250,000 chars; email senders don't get update notifications. ([docs/creating-issues](https://linear.app/docs/creating-issues))
- **Recurring issues:** any new/existing issue or template can be made recurring (`…` menu → Make recurring / Convert into → Recurring issue); future issue appears after due date passes (00:01 next day, team timezone); later template edits don't affect already-created instances. ([docs/creating-issues](https://linear.app/docs/creating-issues))
- **Templates:** workspace or team scope (Settings > Templates). Standard templates pre-set properties; templates can include sub-issues (nested since [changelog 2022-10-13](https://linear.app/changelog/2022-10-13-faster-sub-issue-creation)); up to 10 templates can be exposed to Slack; template email addresses accept intake. ([docs/issue-templates](https://linear.app/docs/issue-templates), [docs/slack](https://linear.app/docs/slack))
- **Triage inbox:** opt-in per team (Team Settings > Triage). Issues default to Triage status when created by integrations, by non-team members, or inside the Triage view. Keyboard: `G T` navigate, `1` accept (moves to default status, optional comment), `2` mark duplicate (merge into canonical; attachments and customer requests move over; duplicate becomes Canceled), `3` decline (Canceled + optional comment), `H` snooze (hide until chosen time or new activity). Can require priority be set before leaving Triage. Triage issues are excluded from views by default (need explicit status filter). ([docs/triage](https://linear.app/docs/triage))
- **Triage automations (Business/Enterprise):** **Triage Rules** (top-down filter→action rules: team, status, assignee, label, project, priority; cross-team routing re-applies the target team's rules); **Triage Intelligence** (LLM suggestions for assignee/labels, surfaces related/duplicate issues); **Triage Responsibility** (on-duty person notified/auto-assigned; syncs PagerDuty/OpsGenie/Rootly/Incident.io; GraphQL API for custom schedules). ([docs/triage](https://linear.app/docs/triage))
- **Backlog:** a status category + default team page; `G B` navigates. One backlog status exists by default; more can be added. ([docs/default-team-pages](https://linear.app/docs/default-team-pages) via search)
- **Slack creation:** `@Linear` agent mention (natural language, works in threads; auto-joins public channels, `/invite @Linear` for private), message action "Create new issue…", `/linear` slash command (ephemeral confirm; no threads/files). Issue-from-message can create a bi-directionally synced comment thread. ([docs/slack](https://linear.app/docs/slack))
- **Sub-issue creation:** `+ Add sub-issues` under description, `Cmd/Ctrl+Shift+O`, command menu; paste a list of titles for bulk creation; `Cmd/Ctrl+Shift+Enter` (or Shift-click save) carries over labels/assignee to the next sub-issue; convert bulleted/checklist text into sub-issues; convert a comment into a sub-issue via its `…` menu. ([docs/parent-and-sub-issues](https://linear.app/docs/parent-and-sub-issues))
- **Bulk editing:** select with `X`, `Cmd/Ctrl+A` (all in view), Shift+click range, Cmd/Ctrl+click multi (also hover near a card's left edge for quick select). Then act via keyboard shortcuts (A assign, L label, S status, Shift+P project…), `Cmd/Ctrl+K` command bar, or right-click contextual menu. ([docs/select-issues](https://linear.app/docs/select-issues) via search + [fastshortcuts](https://fastshortcuts.com/shortcuts/linear/))
- **Archive vs delete:** archiving is **automatic only** — "there is no option to manually archive items." Auto-archive timing set per team (applies to issues, projects, cycles); creator is notified and can unarchive; archived items remain searchable/restorable (`G X` opens team archive). An issue will not archive until its parent, all sub-issues, and its project are also closed/archivable. Delete via `Cmd/Ctrl+Delete` or command bar; `Cmd/Ctrl+Z` quick-undo; deleted issues/projects/initiatives/documents sit in "Recently deleted" for **30 days** (press `#` to restore) then are permanently removed. ([docs/delete-archive-issues](https://linear.app/docs/delete-archive-issues))
- **Issue history/activity:** every issue has an Activity feed logging status changes, auto-close events, etc.; issue **description history** is viewable/restorable via command menu → "Issue description history" or issue menu → "Show description history." ([docs/editing-issues](https://linear.app/docs/editing-issues), [docs/delete-archive-issues](https://linear.app/docs/delete-archive-issues))
- **Auto-close:** team-setting that closes issues not updated within a set period; skipped/delayed for issues in active cycles, unfinished projects, future due dates, active SLAs, or ineligible sub-issues. ([docs/delete-archive-issues](https://linear.app/docs/delete-archive-issues))

## 3. Views & Filtering

- **Layouts:** issue views toggle list ↔ board (`Cmd/Ctrl+B`); project views support list, board, **timeline**; initiatives support list and timeline. ([docs/display-options](https://linear.app/docs/display-options))
- **Grouping:** by status (board default), assignee, project, priority, cycle, label, label group, team, customer, release, SLA status; **sub-grouping** in lists and boards (board rows form swim-lanes); sticky group headers; drag between groups applies that group's property to the issue; group header toggles issue count ↔ total estimate; hide/show empty groups. "No grouping" mode for flat lists. **Focus** (My Issues) is a special grouping that orders your issues by likely next action. ([docs/display-options](https://linear.app/docs/display-options), [docs/board-layout](https://linear.app/docs/board-layout) via search)
- **Ordering:** Status, Manual, Priority, Last created, Last updated, Due date, Link count. **Manual order is workspace-wide** (not per-user); reverse sort unavailable in manual mode. Keyboard reorder: `Option/Alt+↑/↓` (one position), `Option/Alt+Shift+↑/↓` (top/bottom). Status order quirk: lists sort "closest to done → farthest," then completed/canceled — board view follows team workflow order instead. ([docs/display-options](https://linear.app/docs/display-options), [docs/select-issues](https://linear.app/docs/select-issues) via search)
- **Display options** (`Shift+V`): visible properties per row/card (ID, status, assignee, priority, due date, labels, estimate, links, customers, PRs), sub-issues on/off, wrapping. Personal preferences persist per view; "Set as default" makes a view's display config the workspace default; members can layer personal prefs on top. Triage/Inbox views support ordering only, no grouping. ([docs/display-options](https://linear.app/docs/display-options))
- **Filter bar:** press `F` (Shift+F clears last filter; Shift+Option+F clears all). Operators adapt to type: is / is not; is either of / is not (auto-upgrades when a second value is added); includes any/all/either/neither/none (labels, links); before / after (dates). **Advanced filters** support AND/OR with nested groups. Click any part of the formula to edit it. **AI filtering:** natural language ("Show me issues assigned to me") auto-applies filters. ([docs/filters](https://linear.app/docs/filters))
- **Quick filters:** typing a property name in the filter bar surfaces matches (team, status, username, priority words, label, "Active"/"Upcoming" cycle, project, date terms like "N days"/quarter, link sources, milestone). "No labels" = select all + switch to does-not-include. "Added to cycle" ≠ "Cycle": Planned (added before start or within first 24h) vs After cycle (>24h after start) — Linear's explicit scope-creep distinction. ([docs/filters](https://linear.app/docs/filters))
- **Search:** `/` global search; `O I` issue title search; `Cmd/Ctrl+F` searches within current view (also filters Inbox by title/ID/type/assignee). ([docs/search](https://linear.app/docs/search) via search)
- **Saved/shared views:** save any filtered view via `Option/Alt+V`; scopes = workspace-level (all full members) vs team/project/initiative-scoped. Default team views: **All Issues, Active, Backlog** (+ contextual custom views beside them). Copy view URL to share — "sharing a link does not automatically give anyone access." One-off lists via comma-separated IDs in URL (`/issues/ENG-123,ENG-456`). Views have **owners** (creator by default); favorites star to sidebar and can be the default landing page; **view subscriptions** notify on issues added / completed-canceled (personal or to a Slack channel). Initiative views are Enterprise-only. ([docs/custom-views](https://linear.app/docs/custom-views))
- **Projects as tabs:** custom issue views attached to a project appear as reorderable tabs (e.g., "current user", "bug", "standup" filters). ([docs/projects](https://linear.app/docs/projects))

## 4. Cycles & Project Planning

**Cycles** ([docs/use-cycles](https://linear.app/docs/use-cycles)):
- Opt-in per team; Linear then **auto-creates upcoming cycles** on a repeating schedule; length 1–8 weeks (2 weeks most common per the [Linear Method](https://linear.app/method/introduction)); begin 12:01 AM on the chosen day in the team timezone; up to 15 future cycles; optional **cooldown** breaks between cycles (issues can't be assigned to cooldowns; during cooldown, completed issues attribute to the previous cycle).
- **Auto-add automation:** optionally pull Started/Completed issues lacking a cycle into the current cycle.
- **Rollover:** open issues roll into the next cycle automatically; issues moved to backlog/triage/canceled/completed during cooldown are not carried; no way to keep unfinished issues in a closed cycle; completed issues can be moved back to a previous cycle before it ends.
- **Cycle surgery:** future start/end dates editable; current cycle end date only; end current cycle early (end of current day); start next cycle today (12:00 AM team timezone, confirmation popup, irreversible; in-progress cycle completes and open issues move forward).
- **Capacity:** upcoming cycles show a capacity dial estimated from velocity (issues or points completed) over the previous three completed cycles; falls back to member count with no history. Completed-cycle graphs are historical snapshots that can diverge from later edits.
- Calendars: subscribe via Google Calendar, feed URL, or .ics. Disabling cycles preserves history.

**Projects** ([docs/projects](https://linear.app/docs/projects), [docs/initiative-and-project-updates](https://linear.app/docs/initiative-and-project-updates)):
- Progress computed from issue completion; with estimates on, percentage/effort use estimate values; unestimated issues count as 1 point. Progress graph in details sidebar (`Cmd/Ctrl+I`).
- **Project updates** = structured reports: health indicator (On track / At risk / Off track) + rich text (files attachable). First update by lead; afterwards any member can post. Auto-appended progress details appear only if progress changed >2% since last update (hideable). Reminder cadence configurable at workspace level (daily/weekly/biweekly + custom day/time) with per-project override (default/custom/never); reminders only to the lead/owner, with follow-up nudges at +1 and +2 working days. **Staleness signal:** "Update Missing" when last update was On Track and overdue by one reminder cycle + 3 days; grey icon for extended inactivity; filterable by latest-update date.
- Updates deliver to Slack channels (workspace defaults like #project-updates; per-project override via bell icon; public-team requirement for workspace channels), the Linear Inbox, or both; edits sync to Slack; comments on updates sync bi-directionally with Slack threads.
- **Milestones** ([docs/project-milestones](https://linear.app/docs/project-milestones)): created in project overview / details pane / command menu / right-click on timeline date; optional target dates, draggable on timeline (Shift to move multiple); issues added via command menu, `Shift+M`, or drag onto milestone in details pane; completion % counts when issues start and increases on completion; current milestone gets a yellow diamond; groupable/filterable ("Next milestone", "Completed milestones"); Insights can segment by milestone; **cannot be shared across projects**; large milestones convertible to standalone projects (AI suggests description/priority).
- Multi-team projects: tabs toggle all-issues vs per-team issue lists. Timeframes at flexible granularity (year/half/quarter/month/day).

## 5. Keyboard-First UX

Full map from [fastshortcuts.com cheat sheet](https://fastshortcuts.com/shortcuts/linear/) + Linear docs (identical single-key/G-O chords across Mac and Windows):
- **Command menu `Cmd/Ctrl+K`** — "if you forget any other shortcut, open the command menu and type what you want to do." `?` opens the searchable shortcuts help ([changelog 2021-03-25](https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help)).
- **Create:** `C` new issue; `V` full-screen; `Option/Alt+C` from template; `Cmd/Ctrl+Shift+O` sub-issue; `Cmd+Return` save.
- **G-prefix nav:** G I Inbox · G M My Issues · G E All Issues · G B Backlog · G D Board · G P Projects · G T Teams · G C Cycles · G V Active cycle · G R Roadmap · G S Settings · G X Archive; `Cmd/Ctrl+Shift+1–9` jump to team N.
- **O-prefix open:** O I issue · O P project · O C cycle · O F favorites · O U user · O T team · O M my profile.
- **List nav:** `K/J` up/down; `Return` open; `Space` peek; `X` select; `Cmd/Ctrl+A` all; `Cmd/Ctrl+B` list/board toggle.
- **Issue ops:** `E` edit · `R` rename · `D` duplicate · `Cmd/Ctrl+Delete` delete · `#` restore · `Cmd/Ctrl+M` comment · `Shift+S` subscribe · `Cmd/Ctrl+Shift+S` subscribers · `Cmd/Ctrl+L` link URL · `Cmd/Ctrl+Shift+M` move to team · `Cmd/Ctrl+I` details sidebar · `Shift+D` due date · `Shift+E` estimate.
- **Status/priority:** `S` status picker (`Cmd/Ctrl+Option/Alt+1–9` status by position); `P` priority picker; `Shift+1..4/0` Urgent/High/Medium/Low/None.
- **People/labels:** `A` assign · `I` assign to me · `L` labels (`Shift+L` remove).
- **Context:** `M` add to active cycle / relations: `M B` blocked-by · `M X` blocking · `M R` related · `M M` merge duplicate; `Shift+C` cycle; `Shift+P` project; `Shift+M` milestone.
- **Triage:** `1` accept · `2` duplicate · `3` decline · `H` snooze (H is also the general snooze/remind key).
- **Filters:** `F` filter · `Shift+F` clear last · `Shift+Option/Alt+F` clear all; `/` search.
- **Copy:** `Cmd/Ctrl+.` copy ID · `Cmd/Ctrl+Shift+.` git branch name · `Cmd/Ctrl+Shift+,` copy URL.
- **Speed architecture:** interactions "respond in under 100ms" — Linear syncs an in-memory data graph to the server, so navigation/edits are optimistic and instant ([get-alfred.ai review](https://get-alfred.ai/blog/is-linear-worth-it)). Inline editing everywhere: click title/description to edit in place; property changes from list rows via single-key shortcuts without opening the issue; property edits within 3 minutes of creation don't pollute history ([docs/creating-issues](https://linear.app/docs/creating-issues)). Opinionated defaults (fixed status/priority vocabularies) are described by reviewers as "a feature, not a limitation" ([get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it)).

## 6. Integrations & API

- **GitHub** ([docs/github](https://linear.app/docs/github)) — flagship: PR/commit ↔ issue linking via branch name (`Cmd/Ctrl+Shift+.` copies it), issue ID in PR title/description, **magic words** (closing: fix/fixes/resolve/resolves/complete/implement; non-closing: ref/refs/references/part of/contributes to/toward(s); relation: relates to/related to; `skip`/`ignore`+ID blocks linking). `{TEAM}-NEW` in a PR description creates a linked issue (Business/Enterprise: AI writes title/description, sets labels/projects/milestones). Default automations: PR opened → In Progress, merged → Done; customizable per PR state and **per target branch with regex** (e.g., staging → In QA); commit linking via webhook (issue In Progress on push, Done on default-branch merge); multiple issues per PR; multiple PRs per issue (status on final PR); squash-merge loses auto-detection; GitHub Issues one-way/two-way sync (title, description, status, assignee, labels, sub-issues, synced-thread comments only); GitHub Enterprise Cloud = Enterprise plan only; preview-link detection (Vercel/Netlify/Cloudflare/Amplify + custom "preview" links); GitHub Autolink config for issue IDs.
- **Slack** ([docs/slack](https://linear.app/docs/slack)) — see §2/§7: @Linear agent issue creation, message-action creation, `/linear`, synced threads, rich unfurls (assign/comment/subscribe from the unfurl), issue-ID mentions auto-reply with link (60-min suppression per thread), team/project/update notifications to channels, per-project auto-created Slack channels, auto-DM personal notifications; multiple Slack workspaces = Enterprise only.
- **Linear Asks** (Business/Enterprise) — intake for non-Linear users via Slack/email/web with synced replies and custom domains; enables private-team templates in Slack.
- **Support/intake:** Zendesk, Intercom, Front (ticket ↔ issue linking; customer requests attach to issues; status syncs back so support knows when fixed) ([docs/triage](https://linear.app/docs/triage), [usecarly.com](https://www.usecarly.com/blog/best-linear-integrations/)); Business/Enterprise for Zendesk/Intercom + Microsoft Teams ([pricing](https://linear.app/pricing)).
- **Others:** GitLab, Figma (live design embeds on issues; create/link issues from Figma), Sentry (exceptions → issues with stack traces), Discord, Miro, Loom, Salesforce (Enterprise add-on), incident.io, Datadog, Notion, Google Sheets, Zapier, Make; 60+ native integrations overall ([usecarly.com](https://www.usecarly.com/blog/best-linear-integrations/), [pricing](https://linear.app/pricing)).
- **GraphQL API** ([linear.app/developers](https://linear.app/developers)): personal API keys or OAuth 2.0 (with actor authorization and app manifests); webhooks via raw API or SDK; TypeScript SDK with strongly typed models; file uploads; linear.new prefill URLs; Apollo Studio schema reference; dedicated docs for AI-agent interaction (signals, guidelines) and MCP server support (workspace-level, admin-configured, used by chat/comments/loops). **Rate limit: up to 5,000 requests/hour per authenticated user with an API key** (requests share the user's bucket across all their keys) ([rate-limiting docs](https://linear.app/developers/rate-limiting) via search; older third-party guides cite 1,500/hr — outdated).
- **Importers** ([docs/import-issues](https://linear.app/docs/import-issues)): in-product assistants for **Jira, GitHub Issues, Asana, Shortcut, and Linear→Linear** (retain more data, support bulk-delete of an import); CLI CSV importer for everything else (Trello, Pivotal Tracker, GitLab; Trello must be per-board). CSV columns: Title, Description, Priority, Status, Assignee (full name), Created, Completed (not in activity log), Labels (comma-separated), Estimate (needs estimates enabled). Export: CSV at Settings > Administration > Import/Export (doubles as import template). Imports need admin rights; can't target sub-teams; import deletion only in a limited window. Linear→Linear transfers issues through initiatives, templates, dashboards — but NOT integrations, webhooks, OAuth clients, API keys, roles (admins demote to member), settings.

## 7. Notifications & Collaboration

- **Inbox** ([docs/inbox](https://linear.app/docs/inbox)): single in-app notification hub; auto-subscription on create/assign/@mention (mention in a thread subscribes to the thread only). You **cannot choose which events land in the Inbox** — all arrive; channel-level toggles just mirror/relay. `G I` navigate; `J/K` move; click opens issue in a dedicated Inbox view where you act on both. `U` mark read/unread, `Option/Alt+U` all read; `Backspace` delete one, `Shift+Backspace` delete all read; `H` snooze until a time; `Cmd/Ctrl+F` quick-filter by title/ID/type/assignee/team/project/priority. **Hard cap: 2,000 open notifications** — older ones are not retained. No notification archiving.
- **Channels** ([docs/notifications](https://linear.app/docs/notifications)): Desktop, Mobile, Email, Slack groups; per-type toggles within each. Desktop/mobile/Slack are real-time; email is digests **or** immediate (digests only send if unread). Some categories can't be split (e.g., "status changes" bundles completions, cancelations, urgent-priority changes, blocking-relationship changes). For status-specific alerting, docs recommend **view subscriptions** instead. Browser notifications supported; macOS dock badge.
- **Subscriptions:** issue-level (Shift+S / Cmd+Shift+S unsubscribe; My Issues > Subscribed lists them); **view subscriptions** (added/completed-canceled events, personal or Slack-channel); project/initiative update subscriptions.
- **Comments** ([docs/comment-on-issues](https://linear.app/docs/comment-on-issues)): `Cmd/Ctrl+Enter` posts; unsent comments persist as drafts (sidebar Drafts); attachments via paperclip/`Cmd/Ctrl+Shift+A`/drag-drop; **threads** via reply arrow on a comment; threads resolvable (overflow menu; resolving from a reply highlights it as the resolution); emoji reactions on issues/comments/updates (+ custom emojis: JPG/GIF/PNG); **inline comments** on descriptions/documents by highlighting + `Cmd/Ctrl+Option/Alt+M`; `@Linear` in any comment field invokes the agent (draft updates, summarize, generate action items); comment → issue/sub-issue conversion; only the comment author can edit their comment (anyone can edit issue title/description). Resolved-thread AI summaries on Business/Enterprise.
- **@mentions** subscribe the mentioned user; activity feed per issue logs events (with the 3-minute creation grace period).

## 8. Insights / Analytics

- **Insights is Business/Enterprise-only** ([docs/insights](https://linear.app/docs/insights), [pricing](https://linear.app/pricing)); shared insight links viewable workspace-wide.
- Location: insights panel in the right sidebar of most views (`Cmd/Ctrl+Shift+I`), in custom views + team/project/cycle views, full-screen mode.
- **Measures (y-axis):** Issue count, Effort (total estimate), Cycle Time (start→completion, scatterplot), Lead Time (creation→completion), Triage Time (time in Triage), Issue Age. **Slice** = x-axis (including **Burn-up** = cumulative flow over time; defaults to monthly, week-over-week option, include-archived option). **Segment** = color split.
- Filters: Created at, Completed at, Status Type (cross-team-safe), Label, Project, Team; options to include archived and to exclude no-priority issues.
- Interactivity: bar hover breakdowns; click bars/segments/cells to filter the underlying view; scatterplots show 25/50/75/95th percentile markers with click-to-zoom; export to CSV; copy share link.
- **Dashboards** (Oct 2025 best-practices post; Business tier per pricing) assemble insights into durable dashboards ([linear.app/now](https://linear.app/now)).
- Cycle pages add velocity/capacity analytics (see §4). Reviewer criticism of Insights is notable — see Complaints table.

## 9. AI Features (2025–2026)

- **Linear Agent** ([docs/linear-agent](https://linear.app/docs/linear-agent)): invoked via `Cmd/Ctrl+J` chat, `@Linear` in comments on issues/documents/updates/descriptions, and `@Linear` in Slack. Creates/updates issues, projects, milestones, initiatives; summarizes work/threads/customer requests; answers workspace-data questions (AI search/ask); drafts documents and status updates; triage recommendations; **coding sessions**; **Loops** (scheduled/event-triggered background agent automations); workspace-level **MCP servers** for external tools. Enabled by default; admins can disable; operates within the invoking user's permissions.
- **Skills:** save successful agent conversations as reusable skills (personal or team-shared; slash-command or automatic invocation; permissioned per team).
- **Guidance (custom instructions):** workspace-level default + personal (applies to Slack agent too); Slack-specific guidance configured in the Slack integration.
- **Timeline:** Triage Intelligence shipped Sep 2025; Linear Agent for Slack Oct 2025 (all plans per changelog); "Self-driving SaaS" thesis Oct 2025; **"Issue tracking is dead" keynote (Mar 2026)** launched Linear Agent + Skills + Automations, with Code Intelligence, Code Diffs, Coding Sessions "coming soon" ([linear.app/next](https://linear.app/next)). By 2026: **Code Intelligence** (agent reads your codebase — May 2026), **Diffs** (code review inside Linear — May/Jun 2026), **Coding Sessions** ("Linear Agent can now write code… from triage all the way to a reviewed fix" — Jun 2026; mobile coding-session review Jul 2026), **Loops** (Jul 2026), agent-assisted text editing for documents (Jul 2026), team-led initiatives (Aug 2026) ([linear.app/now](https://linear.app/now)).
- **Headline stats:** agents installed in >75% of Linear's enterprise workspaces; agent-completed work up 5x in three months; **agents authored ~25% of new issues** ([linear.app/next](https://linear.app/next)); agent behind "60% of Ramp's merged PRs" (Ramp story, Apr 2026) ([linear.app/now](https://linear.app/now)).
- **Triage Intelligence** ([docs/triage-intelligence](https://linear.app/docs/triage-intelligence) via search): LLM-suggested assignees/labels + similar/duplicate surfacing; AI similar-issue detection described at [linear.app/now/using-ai-to-detect-similar-issues](https://linear.app/now/using-ai-to-detect-similar-issues). Business/Enterprise per [docs/triage](https://linear.app/docs/triage).
- **AI credits** ([docs/ai-credits](https://linear.app/docs/ai-credits)) — the pricing controversy vector: only **coding sessions** and **agent loops** consume prepaid credits. Typical costs: loop run $0.07–$0.20; copy/styling coding session $0.50–$1; small bug fix $3–$5; complex $5+. Prepaid workspace balance (min $10 top-up; auto-reload min $50); credit card only; **funds expire after 12 months**, non-refundable/non-transferable; consumption order promotional → support credits → self-added (closest-to-expiry first); balance can briefly go negative; spend limits at workspace/per-user/per-loop level (approximate — up to 2-min lag, parallel loops can overshoot); usage breakdown retained 3 months. Coding sessions: Basic/Business/Enterprise; Loops: Business/Enterprise only; only admins add funds.
- All other AI features (triage intelligence, AI summaries, natural-language filters, `@Linear` issue creation) are included in plans.

## 10. Pricing & Limits per Tier ([linear.app/pricing](https://linear.app/pricing))

| Tier | Price (annual billing) | Limits & gating |
|---|---|---|
| **Free** | $0 | Unlimited members; **2 teams; 250 issues total**; 10 MB file uploads; Google SSO; API/webhooks; basic integrations; Agent platform + Linear Agent included |
| **Basic** | $10/user/mo | 5 teams; unlimited issues & file uploads; admin roles + team owners; unlimited release pipelines; progress reports; 1 level of sub-teams; coding sessions (with AI credits) |
| **Business** | $16/user/mo | Unlimited teams; **private teams; guests**; sub-teams to 5 levels; Triage Intelligence, Loops, Code Intelligence (beta), coding sessions; **Insights & Dashboards**; Linear Asks (Slack/email/web); sub-initiatives; Diffs; guided reviews; SLAs; Zendesk/Intercom; Microsoft Teams |
| **Enterprise** | Custom (annual only) | SAML SSO, SCIM, advanced auth, IP restrictions, domain claiming, audit log, HIPAA; multiple tenants; Salesforce add-on; invoice/PO; uptime SLA; priority support |

- Free-plan nerf: previously 250 **un-archived** issues, now 250 **total** — a deliberate tightening that angered users ([r/Linear thread](https://www.reddit.com/r/Linear/comments/1hbpqge/people_who_moved_from_github_to_linear_thoughts/)). Completed issues auto-archive helps small teams stay under the cap ([r/Linear pricing thread](https://www.reddit.com/r/Linear/comments/1ax5l2w/pricing_linear_i_have_to_pay_for_all_members_very/)).
- Guests require Business/Enterprise **and are billed as regular members** ([docs/members-roles](https://linear.app/docs/members-roles)).
- Insights, Asks, private teams, guests, triage rules, and loops are the main mid-tier gates; SSO/SCIM is Enterprise-only — a frequent complaint vs. competitors that bundle SSO lower.

## 11. Praised Features (with sources)

| Praised feature | Evidence |
|---|---|
| Speed / <100ms interactions, local-first feel | [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) ("respond in under 100ms… the best-designed issue tracker available"); [G2](https://www.g2.com/products/linear/reviews) ("users consistently praise the intuitive interface and fast performance") |
| Keyboard-first UX & Cmd+K command menu | [G2](https://www.g2.com/products/linear/reviews) (keyboard shortcuts repeatedly cited as standout); [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) |
| Opinionated, focused workflow design (fixed statuses/priorities seen as "a feature, not a limitation") | [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) |
| Cycles + projects as a lean two-level planning hierarchy ("covers 90% of engineering planning needs") | [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) |
| Built-in triage inbox ("stops backlog rot") | [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) |
| GitHub integration depth (branch names, magic words, per-branch automations) | [docs/github](https://linear.app/docs/github); G2 reviewer Anri M. (enterprise gaming, May 2025) praised PR↔issue linkage; [usecarly.com](https://www.usecarly.com/blog/best-linear-integrations/) calls it the "flagship integration" |
| Slack integration (issue creation from messages, synced threads, unfurls) | [usecarly.com](https://www.usecarly.com/blog/best-linear-integrations/); [docs/slack](https://linear.app/docs/slack) |
| Linear Agent AI capabilities (Slack → issues, duplicate detection, coding sessions to PR) | [linear.app/next](https://linear.app/next); [linear.app/now](https://linear.app/now); [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) |
| Clean UI / ease of onboarding; strong adoption after Jira switches | [G2](https://www.g2.com/products/linear/reviews) (~4.5/5, "fast, streamlined… especially popular among software development teams (many switching from Jira)"); [Capterra](https://www.capterra.com/p/10026109/Linear/) (~4.3/5, ease-of-use cited) |
| Great mobile app UX (fast, native feel) — noted by multiple G2 reviewers | [G2](https://www.g2.com/products/linear/reviews) (multiple "Great mobile app!"-style quotes) |

## 12. Complaints / Weaknesses (with sources)

| Complaint | Evidence |
|---|---|
| **Free plan limits** — 250 total issues / 2 teams; nerfed from 250 un-archived | [r/Linear](https://www.reddit.com/r/Linear/comments/1hbpqge/people_who_moved_from_github_to_linear_thoughts/) ("significantly nerfed their free plan"); [pricing](https://linear.app/pricing) |
| **Per-member pricing** feels expensive; guests billed as members | [r/Linear pricing thread](https://www.reddit.com/r/Linear/comments/1ax5l2w/pricing_linear_i_have_to_pay_for_all_members_very/); [docs/members-roles](https://linear.app/docs/members-roles) |
| **AI credit opacity/risk** — prepaid balance, expires in 12 months, non-refundable, limits only approximate (2-min lag; parallel loops overshoot) | [docs/ai-credits](https://linear.app/docs/ai-credits) |
| **Insights underwhelming for a premium gated feature**; weak visualizations/reporting vs. Jira/ClickUp | G2 verified user, events services, Jan 2025 ("Linear insights are underwhelming for a premium feature"); G2 reviewer Sebastian S., insurance, Oct 2024 ("Visualizations are not as extensive as I would like"); [G2 aggregate](https://www.g2.com/products/linear/reviews) ("limited features restrict customization and analytics capabilities") |
| **Mobile rough edges** — browser scroll issues; accidental issue moves between board columns on touch | G2 reviewer Chris S., computer software, Aug 2024 |
| **Cycle navigation friction** — hard to navigate between cycles; assignee filters not resetting between cycle selections | G2 reviewer Joe G., small business pharmaceuticals, Oct 2024 |
| **Goals/initiative tracking is thin** | G2 reviewer Pietro V., mid-market IT services, Aug 2024 ("could be better planning/tracking goals and initiatives") |
| **Too developer-focused** for marketing/HR/ops; weak for general PM (campaigns, hiring pipelines) | [G2](https://www.g2.com/products/linear/reviews); [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) ("Marketing, sales, and ops will find it too developer-focused") |
| **Intentionally limited customization** — no compliance fields/approval workflows/audit trails at lower tiers; a dealbreaker for some enterprises | [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it); [G2 aggregate](https://www.g2.com/products/linear/reviews) |
| **Sorting gaps** in views | [Capterra](https://www.capterra.com/p/10026109/Linear/): "I sometimes wish I could order by different criteria, like latest added, due date, etc." |
| **Communication-to-issue pipeline still manual** for email/Slack inputs beyond built-in channels; no true email integration (notifications only) | [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) |
| **Notification grouping too coarse** — can't split status-change events; can't choose what lands in Inbox; 2,000-notification cap drops older ones | [docs/notifications](https://linear.app/docs/notifications), [docs/inbox](https://linear.app/docs/inbox) |
| **GitHub integration edge cases** — squash merges break auto-close detection; PR-reviewer visibility gaps | [docs/github](https://linear.app/docs/github); G2 reviewer Anri M., May 2025 |
| **Docs/notes are not a Notion-class wiki** — Linear added documents, but knowledge management is secondary to tracking (hence Prodmax's opportunity) | [linear.app/next](https://linear.app/next) positions Linear as context+execution; [get-alfred.ai](https://get-alfred.ai/blog/is-linear-worth-it) on non-eng focus |
| No manual archive; archiving is automatic-only (control complaint); sub-issue order is per-user, not global | [docs/delete-archive-issues](https://linear.app/docs/delete-archive-issues); [docs/parent-and-sub-issues](https://linear.app/docs/parent-and-sub-issues) |
| Offline: no documented offline mode; web app depends on connectivity (not addressed anywhere in official docs) | Absence in [linear.app/docs](https://linear.app/docs) |

## 13. Edge Cases & Notable Behaviors

- **Concurrent edits:** any member can edit any issue's title/description (only comment authors can edit their comments). No documented conflict-resolution UI — Linear's sync engine reconciles last-writer property updates; the model is per-field updates from an in-memory graph, with the Activity feed as the audit trail. ([docs/editing-issues](https://linear.app/docs/editing-issues))
- **Drag-drop semantics:** dragging an issue to another group **mutates the issue** (it adopts the group's status/assignee/priority/etc.) — not a cosmetic move. Manual ordering is **global to the workspace** (everyone shares it); reverse sort is disabled in manual mode; keyboard reorder via Alt+arrows. Moving issues between board columns on mobile has caused accidental property changes (G2 complaint). ([docs/display-options](https://linear.app/docs/display-options))
- **Undo:** `Cmd/Ctrl+Z` immediately after delete/move undoes it; but undoing a team move may leave label/subscriber/estimate/access changes partially applied — undo is best-effort, not transactional. ([docs/editing-issues](https://linear.app/docs/editing-issues), [docs/delete-archive-issues](https://linear.app/docs/delete-archive-issues))
- **Issue moves between teams:** new ID and URL (old links redirect; old IDs remain searchable; inline references still resolve but don't visually update); team labels and projects are dropped, cycle may be cleared, status maps to nearest equivalent, open issues from outsiders go to Triage if enabled. ([docs/editing-issues](https://linear.app/docs/editing-issues))
- **Relations lifecycle:** blocked/blocking relations downgrade to "related" once the blocker resolves; duplicates are terminal (reserved status, one-way merge from the duplicate). ([docs/issue-relations](https://linear.app/docs/issue-relations))
- **Roles:** Workspace Owner (Enterprise only: billing, security, audit logs, exports, OAuth approvals) > Admin (day-to-day; **on Free everyone is an admin**) > Member (no workspace admin pages) > Guest (Business/Enterprise; team-scoped access; no workspace views/initiatives; sees only their teams' issues in multi-team projects; warned that workspace-wide integrations can leak data beyond guest scope; **billed as regular members**). Team owners exist on Business/Enterprise (delete/private/parent-team actions reserved); team permission settings do not inherit to sub-teams. ([docs/members-roles](https://linear.app/docs/members-roles))
- **Workspace vs team settings:** workspace = members, security, teams, integrations, initiatives, AI settings, import/export, templates; team = general (timezone, estimates, email intake), members, labels, templates, recurring issues, Slack notifications, issue statuses & automations, triage, cycles, access & permissions. ([docs/teams](https://linear.app/docs/teams))
- **Team deletion:** 30-day grace in "Recently deleted"; **retiring** a team freezes it read-only preserving history (must clear active issues and sub-teams first). ([docs/teams](https://linear.app/docs/teams))
- **Activity log grace:** edits within 3 minutes of issue creation are folded into "creation" and never logged; CSV-imported `Completed` dates never appear in activity. ([docs/creating-issues](https://linear.app/docs/creating-issues), [docs/import-issues](https://linear.app/docs/import-issues))
- **Milestones** can't span projects; **projects** can't share a single issue (workaround: sub-issues in different projects). ([docs/project-milestones](https://linear.app/docs/project-milestones), [docs/projects](https://linear.app/docs/projects))
- **Initiative visibility:** all members except guests see initiatives; private-team projects inside a workspace initiative stay team-visible while the initiative remains viewable. ([docs/initiatives](https://linear.app/docs/initiatives))
- **Cycle stats are snapshots:** completed-cycle graphs won't retroactively change when issues are later reopened/moved; capacity needs 3 completed cycles of history or falls back to headcount. ([docs/use-cycles](https://linear.app/docs/use-cycles))
- **Inbox cap:** 2,000 open notifications; older are dropped (not archived). **Suspended users** can't be filtered; their profiles remain for history. ([docs/inbox](https://linear.app/docs/inbox), [docs/members-roles](https://linear.app/docs/members-roles))
- **Import deletion window** is limited; re-importing without deleting skips already-imported items; imports can't target sub-teams. ([docs/import-issues](https://linear.app/docs/import-issues))

---

## Implications for Prodmax

1. **Match the object spine:** workspace → teams → issues/projects → cycles/milestones, with cross-team projects, per-team workflow states (fixed category set + custom statuses), workspace/team labels with label groups, and initiatives above projects. This skeleton is the load-bearing value.
2. **Steal the *behaviors*, not the pixels:** the 3-minute activity-log grace, draft persistence (6 months), blocked→related relation downgrade, duplicate-as-terminal-status, and auto-close/auto-archive automations are the polish that makes Linear feel engineered.
3. **Keyboard-first is table stakes:** single-key issue ops (C/E/A/L/S/P/X/M), G- and O- prefixes, and a Cmd+K command menu that can do everything. Prodmax should ship a command palette on day one and treat the mouse as optional.
4. **Architecture for speed:** Linear's perceived speed comes from an in-memory synced data graph with optimistic updates and per-field mutations, not from cosmetic tweaks. Prodmax needs a client-side cache/sync design (GraphQL subscriptions or equivalent) from the start.
5. **Be the docs half Linear lacks:** Linear bolted documents onto a tracker; Prodmax's differentiator is Notion-grade docs living natively beside issues (inline doc comments, project briefs, issue descriptions with version history). This is the clearest green-field gap.
6. **Fix the analytics gap:** ship useful reporting (velocity, burn-up, created-vs-completed, cycle/lead/triage time, unpointed issues) on lower tiers than Linear does, with richer visualizations — reviewers explicitly call Linear Insights "underwhelming for a premium feature."
7. **Generous free tier:** avoid the 250-total-issues trap; auto-archive completed work without counting it against limits. Reddit resentment over the nerf is a live acquisition wedge.
8. **Transparent AI pricing:** if Prodmax meters agent work, do post-paid or hard caps with real-time spend visibility — Linear's expiring, prepaid, approximately-limited credits are its most-mocked commercial behavior.
9. **AI triage as a first-class inbox:** similar/duplicate detection, auto-suggested labels/assignees, natural-language issue creation from Slack/email, and agent-authored issues mirror Linear's direction (25% of its issues are agent-created). Build agent identity and provenance into the data model now.
10. **Granular notifications:** allow per-event channel control (split status-change types), keep an Inbox with snooze/reminders, but don't silently cap at 2,000 or force all-or-nothing inbox delivery — both are documented Linear complaints.
11. **Watch the mobile/touch drag trap:** dragging that mutates properties is powerful on desktop and error-prone on touch; require explicit confirm on mobile or use a move-sheet pattern. Also honor per-view saved sort orders and offer more sort criteria (due date, latest added) than reviewers say Linear exposes.
12. **Cross-team semantics need care:** issue moves get new IDs (with redirects), status remapping, dropped team labels/projects, and triage routing for outsiders — define these rules explicitly or users will lose data silently.
13. **Undo must be near-transactional:** Linear's undo leaves partial state after team moves; Prodmax should implement compensating-action undo for destructive ops (move, merge, bulk edit) — bulk ops + undo history is a trust feature.
14. **Importers are the front door:** CSV + Jira/GitHub/Linear assistants with a delete-import window; CSV export doubles as the template. Migration friction decides competitive switches.
15. **Gate features where users feel pain, not where they feel priced-in:** Linear gates SSO, insights, guests, and private teams up-tier. Prodmax can win goodwill by including SSO and basic analytics early while gating scale features (audit logs, SLAs, enterprise auth).

---

### Source Index (primary)

1. https://linear.app/docs — docs hub
2. https://linear.app/docs/creating-issues
3. https://linear.app/docs/issue-relations
4. https://linear.app/docs/parent-and-sub-issues
5. https://linear.app/docs/configuring-workflows
6. https://linear.app/docs/triage
7. https://linear.app/docs/teams
8. https://linear.app/docs/estimates
9. https://linear.app/docs/labels
10. https://linear.app/docs/use-cycles
11. https://linear.app/docs/projects
12. https://linear.app/docs/initiatives
13. https://linear.app/docs/initiative-and-project-updates
14. https://linear.app/docs/project-milestones
15. https://linear.app/docs/custom-views
16. https://linear.app/docs/filters
17. https://linear.app/docs/display-options
18. https://linear.app/docs/editing-issues
19. https://linear.app/docs/delete-archive-issues
20. https://linear.app/docs/inbox
21. https://linear.app/docs/notifications
22. https://linear.app/docs/comment-on-issues
23. https://linear.app/docs/insights
24. https://linear.app/docs/linear-agent
25. https://linear.app/docs/ai-credits
26. https://linear.app/docs/members-roles
27. https://linear.app/docs/github
28. https://linear.app/docs/slack
29. https://linear.app/docs/import-issues
30. https://linear.app/developers (+ /developers/rate-limiting)
31. https://linear.app/pricing
32. https://linear.app/now
33. https://linear.app/next ("Issue tracking is dead" keynote)
34. https://fastshortcuts.com/shortcuts/linear/
35. https://www.g2.com/products/linear/reviews
36. https://www.capterra.com/p/10026109/Linear/
37. https://www.reddit.com/r/Linear/ threads (free-plan nerf; pricing)
38. https://get-alfred.ai/blog/is-linear-worth-it
39. https://www.usecarly.com/blog/best-linear-integrations/
40. https://linear.app/method/introduction
