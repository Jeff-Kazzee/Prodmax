# Notion Deep Dive — Competitive Research for Prodmax

Research agent: R2 | Compiled: 2026-08-16 | Scope: Notion as of mid-2026 (features, limits, praise, complaints, technical causes of slowness). Sources are inline. 30+ distinct sources used; primary sources are Notion's own help center, developer docs, engineering blog, releases page, plus G2/Capterra/Reddit/community analyses.

---

## 1. Block Model

**Architecture: "everything is a block."**
- Every unit of content — paragraph, heading, image, list item, table row, even a page and a database — is a block record. Each block has: an `ID` (UUIDv4), type-specific `properties`, a `type`, an ordered `content` array of child block IDs ("downward pointers"), and a `parent` pointer ("upward pointer"). The hierarchy is a graph, not a strict tree, because a block can be referenced by multiple content arrays. Indentation is structural, not visual: indenting a block moves it into a sibling's content array. ([Notion engineering blog](https://www.notion.com/blog/data-model-behind-notion))
- Consequence: a 3,000-word page is not one document but "a few thousand rows the client has to fetch, hydrate, and render." ([Falconer](https://falconer.com/guides/why-is-notion-slow/))

**Complete block type list (from the API reference):**
`paragraph`, `heading_1`, `heading_2`, `heading_3` (a `heading_4` exists in the API enum; product UI exposes H1–H3), `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `quote`, `callout`, `divider`, `code`, `equation` (inline + block), `image`, `video`, `audio`, `file`, `pdf`, `bookmark`, `embed`, `link_preview`, `table` (simple table), `table_row`, `table_of_contents`, `breadcrumb`, `column_list`, `column`, `synced_block`, `child_page`, `child_database`, `template` (button), `tab` (tabbed container), `meeting_notes` (renamed from `transcription` in API version 2026-03-11), `unsupported`. Uploaded HTML files create an HTML block. ([Notion API block reference](https://developers.notion.com/reference/block))

- Blocks that accept children: list items, callout, column, child page/database, toggleable headings (`is_toggleable`), paragraph, quote, synced block, table, template, to_do, toggle. Tabs accept only paragraphs as direct children.
- Common block properties: `id`, `parent`, `has_children`, `created_time`/`last_edited_time`, `created_by`/`last_edited_by`, `in_trash`/`archived`.
- **Columns**: a `column_list` must contain at least two columns, each with at least one child; columns cannot nest columns. ([API reference](https://developers.notion.com/reference/block))
- **Simple tables**: fixed `table_width` at creation; cells are plain rich text, not spreadsheet formulas (databases are the "real" table).
- **Toggle headings**: any heading can be toggled to hide children.

**Synced blocks** ([Notion Help](https://www.notion.com/help/synced-blocks)):
- Select blocks → ⋮⋮ → Turn into → Synced block; copy and paste instances anywhere (same page, other pages, other workspaces).
- Edits to any instance update all copies; the origin is marked ORIGINAL; "Editing in ↙ # other pages" navigates to copies.
- Copies are only editable by people with edit access to the original's page.
- Unsync detaches one copy; "Unsync all" detaches everything.
- Edge case: with more than 10 copies, Unsync all or deleting the original removes all copies and **Undo will not restore them**.
- API constraint: the original synced block must exist before duplicates; synced block content cannot be updated via the API.

**Turn into & drag handles:**
- The ⋮⋮ handle on hover (and `Esc`-based keyboard flow) gives: Delete, Duplicate, Turn into, Move up/down, Copy link (anchor URL per block), Comment.
- "Turn into" converts between compatible types (paragraph ↔ headings ↔ lists ↔ toggle ↔ quote ↔ callout ↔ synced block, etc.); markdown shortcuts (`#`, `-`, `[]`, `>`, ``` ``` ```) auto-create block types.
- Every block has a copyable URL for deep links into the middle of long pages. ([Links & backlinks help](https://www.notion.com/help/create-links-and-backlinks))

---

## 2. Pages

- **Page tree**: pages nest infinitely as sub-pages; the sidebar shows Private / Teamspace sections, Favorites, and the full tree. A "Link to page" block behaves like a sub-page and appears in the sidebar hierarchy, while an `@`-mention is just a hyperlink. ([Links & backlinks](https://www.notion.com/help/create-links-and-backlinks))
- **Icons & covers**: emoji or uploaded icons, cover images (gallery, URL, upload). ([Page icons & covers guide](https://www.notion.com/help/guides/page-icons-and-covers))
- **Favorites & pins**: favorite pages pin to a sidebar section; any page can be ⭐-pinned to the top of search recents. ([Search help](https://www.notion.com/help/search))
- **Trash/restore** ([Delete & restore content](https://www.notion.com/help/duplicate-delete-and-restore-content)):
  - Deleted pages sit in Trash for 30 days (default), then 30 more days of internal retention before irrecoverable even for owners; Enterprise owners can customize retention windows.
  - Trash supports search and filtering by last editor, parent page, teamspace; pages in trash can't be edited until restored; no bulk empty-trash.
  - Deleted database properties are restorable via Settings → Edit Properties → Deleted Properties (permanent delete is irreversible).
  - Notion support can restore from backups within ~30 days.
- **Version/page history**: snapshots saved roughly every 10 minutes during active editing plus one final version ~2 minutes after the last edit. Retention: **Free 7 days, Plus 30, Business 90, Enterprise unlimited**. Viewing/restoring requires at least Can edit access; detailed diff not available on mobile. ([same page](https://www.notion.com/help/duplicate-delete-and-restore-content))
- **Backlinks & link mentions**: backlinks are created automatically when a page is @-mentioned; shown above the page title; only visible backlinks you have access to appear (private ones labeled "Private"). Pasting a URL offers "Paste as mention" — a compact inline card with icon/source/title. ([Links & backlinks](https://www.notion.com/help/create-links-and-backlinks))
- **Archiving (Beta, Business/Enterprise)**: separate from deletion; archived pages stay accessible, links keep working, hidden from search by default. ([Delete & restore content](https://www.notion.com/help/duplicate-delete-and-restore-content))

---

## 3. Databases

**The core idea**: a database is a collection of pages — every row/card/entry is itself a full Notion page with properties. ([Intro to databases](https://www.notion.com/help/intro-to-databases))

**Full-page vs inline vs linked:**
- Full-page databases live in the sidebar like pages; can be locked so others can't alter structure.
- Inline databases embed in a page; controls appear on hover; can expand to full page and vice versa (drag into sidebar to promote).
- **Linked views** mirror a data source anywhere in the workspace with independent filters/sorts/views; users with "Can edit content" can still create linked databases and tweak views inside them. A single database can have multiple data sources (e.g., CRM with contacts/companies/deals in one). ([Intro to databases](https://www.notion.com/help/intro-to-databases))

**View types** ([Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)): Table (default), Board (Kanban), List, Calendar, Timeline, Gallery, Chart (bar/line/donut), Forms; a community "Feed view" also exists ([Simone Smerilli](https://www.simonesmerilli.com/writing/notion-database-settings)). Per-view settings: layout, property visibility, filter, sort, group + sub-group, "open pages in" (side peek / center peek / full page), one frozen column. Views can be shared by link and appear nested in the sidebar.

**Property types** ([NotionApps guide](https://www.notionapps.com/blog/notion-database-properties-explained/) + help): Title, Text, Number, Select, Multi-select, Status (grouped To-do / In progress / Complete), Date (+ reminders), Person, Files & media, Checkbox, URL, Email, Phone number, Formula, Relation, Rollup, Created time, Created by, Last edited time, Last edited by, ID, Button, and AI autofill properties (2025+). Automatic types (timestamps, formulas, rollups) are computed, not typed.

**Filters / sorts / groups:**
- Simple filters + advanced filter groups with AND/OR nesting **up to three layers deep**; filters/sorts can be saved "for everyone" or personal-only. ([Views help](https://www.notion.com/help/views-filters-and-sorts))
- Multi-level sorts with drag-ordering; select/multi-select option order is user-defined.
- Group by any property; sub-groups (second grouping layer, e.g., status → priority swimlanes); hide empty groups; manual or alphabetical group sorting. ([Boards help](https://www.notion.com/help/boards))

**Database templates + recurring**: every database has a templates button; any template can be set to **Repeat** (daily/weekly/monthly, start date/time), auto-generating pages on schedule. ([Repeating database templates guide](https://www.notion.com/help/guides/automate-work-repeating-database-templates))

**Sub-items** ([Sub-items & dependencies](https://www.notion.com/help/tasks-and-dependencies)): self-relation parent/child rows; rendered as nested toggles or flattened lists (table/list/timeline) or as a card property (board/calendar/gallery); filter modes Parents only / Parents and sub-items / Sub-items only; deleting a parent deletes its sub-items; duplicating a parent duplicates sub-items.

**Dependencies**: linear blocked-by/blocking relations on the same database; three date-shifting modes when predecessors move (shift only on overlap / shift & maintain time between items / never auto-shift) plus "avoid weekends."

**Database automations** ([help](https://www.notion.com/help/database-automations)):
- Triggers: Page added; Property edited (with condition types, e.g., "is set to"); Every {frequency} (recurring daily/weekly/monthly with timezone). Multiple "is edited" triggers must fire within ~3 seconds or the automation may fail.
- Actions: Edit property, Add page to (another DB), Edit pages in, Send notification (≤20 people), Send mail (Gmail), Send webhook, Send Slack notification; variables from mentions/formulas.
- Constraints: automations **cannot trigger other automations**; won't act on restricted pages; guests can't create automations; locked databases don't trigger; failed automations pause and need manual reactivation.
- Plan gating: the help page says "paid plans" (Free = Slack-notification automations only), while the 2026 pricing page lists "custom database automations" as **Business+** — gating appears to have tightened in 2026. ([Pricing](https://www.notion.com/pricing))

**Formulas 2.0** ([What's changed](https://www.notion.com/help/guides/new-formulas-whats-changed), [Notion VIP intro](https://www.notion.vip/insights/notion-formulas-2-0-the-definitive-introduction)):
- Typed language: numbers, strings, dates, booleans, pages, people, lists; output can now be pages/dates/people/lists (previously text/number/checkbox only).
- Direct access to related databases' properties via `map()`/`filter()`/`length()` + `current` + dot chaining — many rollups no longer needed.
- `let()`/`lets()` variables, `/* comments */`, `ifs()`, `match()`, `style()`, multi-line editor with inline type errors.
- Formulas recalculate every time the database loads — a key performance tax (see §12). Community reports heavy relation-chasing formulas slow big databases. ([Reddit](https://www.reddit.com/r/Notion/comments/1iknlji/formulas_in_automations_completely_transformed_my/))

**Hard limits Notion publishes** ([Optimize database load times](https://www.notion.com/help/optimize-database-load-times-and-performance)):
- 250,000 rows per database (blocks new rows at limit); 500 properties per database; 2.5 MB property data per database page; 1.5 MB total property structure; 1.5 MB cap on deleted properties in trash; 10,000 references per two-way relation.
- With >1,000 items, new pages may appear mid-collection instead of at the end due to indexing/sorting of large collections. ([Intro to databases](https://www.notion.com/help/intro-to-databases))

---

## 4. Search

**How search works** ([Search help](https://www.notion.com/help/search)):
- Cmd/Ctrl+P (or K) opens "Quick Find": recents, "Most viewed"/"Popular this week" labels, jump-to Home/Settings, exact-match with quotes.
- "Best Matches" ranking favors page titles and recently edited pages over body content; sorts by last edited/created; filters: Title only, Created by, Teamspace (Plus+), In (page subtree), Date ranges.
- **Workspace search matches page contents; database search matches only titles + property values** (not page bodies) — a common confusion point.
- In-page find via Cmd/Ctrl+F. Desktop "Command Search" works outside the app (menu bar/taskbar).
- Excluded from workspace search: @-mentions of people/pages, comments/discussions, select & multi-select property values; CJK support "still improving."

**Slowness complaints**: "Search Can Be Slow in Large Workspaces" is a headline con in 2026 reviews ([Knowledgebase.net](https://www.knowledgebase.net/software/notion-review)); Reddit users report multi-second search and page-open times in large workspaces ([r/Notion](https://www.reddit.com/r/Notion/comments/12322on/i_find_notion_too_slow_for_any_serious_work_why/)). Under the hood, search index updates happen as background work after transactions commit (Quick Find indexing) ([Notion blog](https://www.notion.com/blog/data-model-behind-notion)).

**Notion AI Q&A / "Search all sources with AI"**: Enterprise Search answers questions with citations, searching the workspace plus connected apps (Slack, MS Teams, Google Drive, Jira, GitHub "and more") and the web; model selector across GPT-5/Claude/Gemini; can reason over database views, relations, properties; Business/Enterprise only. ([Enterprise Search help](https://www.notion.com/help/enterprise-search)) Third-party benchmark: median time to first token 18.3s and full answer 27.1s for Notion AI Q&A. ([Falconer](https://falconer.com/guides/why-is-notion-slow/))

---

## 5. Notion AI (2025–2026)

**Timeline of shipped AI** ([Releases](https://www.notion.com/releases), [2025-05-13](https://www.notion.com/releases/2025-05-13), [Matthias Frank tracker](https://matthiasfrank.de/en/notion-updates/)):
- **AI writing**: draft/translate/summarize/tone in docs; AI PRD templates.
- **AI blocks** (live-updating blocks in pages): AI Summary, AI Key Info (action items/takeaways), AI Translation, custom AI blocks with your own prompt. ([eesel guide](https://www.eesel.ai/blog/notion-ai-autofill))
- **AI autofill database properties**: summary/key-info/translation/custom prompts per row; "auto-update on page edits" exists but users report delays of minutes-to-hours and missed triggers. ([eesel](https://www.eesel.ai/blog/notion-ai-autofill))
- **AI Meeting Notes** (May 2025): a `meeting_notes` block that transcribes/summarizes in real time; Notion Calendar can auto-join calls. ([Release 2025-05-13](https://www.notion.com/releases/2025-05-13))
- **Q&A / Enterprise Search** with connectors (Slack, Teams, Drive, Jira, GitHub...) and citations. ([help](https://www.notion.com/help/enterprise-search))
- **Notion Agent** (late 2025): workspace agent that builds project structures and automates workflows; **Custom Agents** fine-tunable, consuming credits ($10 per 1,000 credits); agent activity in audit log. ([Pricing](https://www.notion.com/pricing), [Releases](https://www.notion.com/releases))
- **2026 releases**: sidebar tabs for pages/agent chats/meetings/notifications (3.4, Mar 26); agents inside databases via AI autofill (3.4 part 2, Apr 14); **Workers** — custom code execution extensions (free trial, credits start Oct 15); HTML blocks; usage metering. ([Releases](https://www.notion.com/releases), [2026-03-26](https://www.notion.com/releases/2026-03-26), [2026-04-14](https://www.notion.com/releases/2026-04-14))

**Pricing complaints (per-user add-on era)**:
- Originally AI was a **~$8–10/member/month add-on** on top of any plan; in May 2025 Notion unbundled/re-bundled: full AI included only in Business/Enterprise, Free/Plus reduced to a "limited trial." ([Reddit pricing megathread](https://www.reddit.com/r/Notion/comments/1kkxnl8/), [Pricing](https://www.notion.com/pricing))
- Users called the changes "like a scam" ([Reddit](https://www.reddit.com/r/Notion/comments/1klq9r9/notion_pricing_update_no_more_ai_for_plus_accounts/)), students forced off education plans ([Reddit](https://www.reddit.com/r/Notion/comments/1pcvtli/notion_ai_is_too_expensive_for_users_who_only/)), and Enterprise customers reported ~40% license hikes from default AI bundling ([Reddit](https://www.reddit.com/r/Notion/comments/1od2cew/anyone_with_notion_enterprise_been_hit_with_a_40/)).

---

## 6. Collaboration

**Comments & mentions** ([Comments, mentions & reactions](https://www.notion.com/help/comments-mentions-and-reminders)):
- Page-level discussions (Add comment at top) + inline comments (select text → Comment; block ⋮⋮ → Comment; Cmd+Shift+M) + property comments in tables; resolve ✔️ / reopen; comments pane filters by person/open/resolved; reactions on text and comments.
- @-mention people, groups (10-member hover preview), pages (auto backlink), dates ("@today" converts to numbered dates over time). A Person property value triggers the same notification as a mention.
- **Notification behavior**: with Notion open → inbox badge only; with Notion closed → email. **@-mentioning someone without page access does NOT notify them** (permission edge case).

**Inbox**: sidebar Inbox aggregates mentions/comments/invites with reply/resolve/archive in place; page-level "Notify me" (all comments / replies & mentions); configurable notification settings. ([Inbox help](https://www.notion.com/help/updates-and-notifications))

**Permission model** ([Sharing & permissions](https://www.notion.com/help/sharing-and-permissions)):
- Page levels: **Full access** (edit + share), **Can edit** (no sharing), **Can edit content** (databases: edit rows/property values but not structure/views/filters), **Can create** (databases, Business/Enterprise: submit new pages without seeing others' — e.g., IT tickets), **Can comment**, **Can view**.
- Inheritance: sub-pages inherit parent permissions; **Notion respects the broadest access granted**; moving a page to Private strips access on that page only.
- General access scopes: Only people invited / Everyone at {workspace} (+ "Hide in search" toggle) / Anyone on the web with link (links can expire; Enterprise can disable public links entirely).
- Workspace roles: workspace owner, admin, teamspace owner, member ([who's who](https://www.notion.com/help/sharing-and-permissions)); groups for bulk grants (groups not pinged by person-property rules).
- Database-level permission rules tied to a Person or Created-by property apply across all views and linked views (Business/Enterprise).
- **Guests**: outside collaborators invited page-by-page (their own Notion account needed); 10 on Free, unlimited on paid; cannot create automations; guest invites can silently fail (limits, domain rules) and auto-convert to member invites.

**Web publishing / Notion Sites** ([help](https://www.notion.com/help/public-pages-and-web-publishing)):
- Share → Publish → live at a notion.site URL; edits update the site automatically; publishing a page publishes all sub-pages (permissions can hide them).
- Free: unlimited published pages, 1 notion.site domain. Paid: slug customization (letters/numbers/hyphens, ≤60 chars, unique workspace-wide, deleted slugs not reusable), SEO title/description, search-indexing toggle (indexing can take up to 4 weeks), themes, Google Analytics, custom domain add-on.
- Privacy leak edge case: published page metadata exposes names/photos/emails of contributors. Enterprise owners can block all publishing.
- Free-plan sharing nuance: 10 guests; "Duplicate as template" lets visitors clone public pages.

---

## 7. Templates & Use Cases (why people adopt Notion)

- **All-in-one replacement**: teams adopt Notion to replace separate wiki + docs + project tools, keeping knowledge next to work. ([Notion Projects](https://www.notion.com/product/projects), [Simplilearn](https://www.simplilearn.com/notion-project-management-article))
- **Project tracker**: custom priority labels, status tags, Kanban/roadmap views; acknowledged weakness vs dedicated PM tools on advanced reporting and async communication. ([Notion Projects](https://www.notion.com/product/projects), [Sync2Sheets](https://sync2heets.com/blog/notion-for-project-management-tips-and-best-practices/))
- **Wiki / docs / SOPs**: briefs, design guidelines, technical docs next to tasks; G2 leader / "#1 knowledge base 3 consecutive years." ([G2](https://www.g2.com/products/notion/reviews), [Notion](https://www.notion.com/))
- **Meeting notes**: agenda/minutes/action-item templates; notes connected to projects; dedicated meeting-notes template category. ([Notion templates](https://www.notion.com/templates/category/meetings), [Notion blog](https://www.notion.com/blog/connect-meeting-notes-to-projects))
- **Template ecosystem as adoption accelerant**: ready-made connected databases lower setup barrier — a major reason teams start. ([Notion guide](https://www.notion.com/help/guides/teams-organize-track-manage-work-in-notion), [ClickUp roundup](https://clickup.com/blog/notion-meeting-notes-templates/))
- Adoption friction noted by reviewers: learning curve and "works best if you adapt to Notion's structure." ([Capterra](https://www.capterra.com/p/186596/Notion/reviews/), [Knowledgebase.net](https://www.knowledgebase.net/software/notion-review))

---

## 8. Import / Export & API Limits

**Import** ([Import data into Notion](https://www.notion.com/help/import-data-into-notion)):
- File types: .txt, .md, .docx, .csv, .html, .pdf, .zip. App importers: **Evernote** (notebooks→pages, notes→list DB; reliable to ~5,000 notes; no Evernote Teams/China), **Trello** (boards→DB, cards→items; ~5,000 cards/board, ~5,000 comments), **Confluence** (cloud-only, new editor, space-export .zip only; 5 GB zip / 30 GB API limits), **Asana**, **Monday.com**, **Google Docs** (one at a time; suggestions/comments/colors/dividers don't import; 5 MB Free / 50 MB paid), Quip/Dropbox Paper/WorkFlowy via export-then-import workarounds.
- CSV import creates a database (columns→properties, rows→pages) or merges into an existing DB; **cannot create rollups, formulas, or relations**; adds rows only (dupes possible).
- PDF import converts to a searchable page; tables become simple tables, not databases; 5 MB Free / 20 MB paid.
- HTML/Text/Markdown: ~120 files per 12 hours rate limit; anchor links and nonstandard Markdown don't import; H4+ demoted to H3.
- General limits: 5 MB/file Free, 50 MB paid; community-documented CSV cap ~25,000 rows / 5 MB per import. ([Breeze.pm](https://www.breeze.pm/articles/export-from-notion))

**Export** ([Export your content](https://www.notion.com/help/export-your-content)):
- Formats: PDF (sub-page PDFs require Business/Enterprise; **workspace-wide PDF export is being retired by Aug 31, 2026**), HTML (zip; includes resolved+unresolved comments), Markdown & CSV (databases → CSV + one .md per row page; callouts fall back to HTML).
- Only the current/default view exports; form views not exportable; entire-workspace export can take **up to 30 hours**; emailed download links expire in 7 days; Windows 260-char path bug on zips.
- Community critique: Markdown/HTML export is messy (nested zip folders, broken formatting) — third parties exist solely to fix it. ([Unmarkdown](https://unmarkdown.com/blog/notion-export-broken))

**API limits** ([Request limits](https://developers.notion.com/reference/request-limits)):
- Rate: **average 3 requests/second per connection** (bursts allowed; effectively ~2,700 requests/15 min per community measurement — [Reddit](https://www.reddit.com/r/Notion/comments/xfufed/how_do_you_handle_request_limits_using_notion_api/)) **plus a per-workspace limit scaled to plan**; 429 and 529 responses return `Retry-After`; recommended queue + exponential backoff with jitter.
- Size: max **1,000 block elements and 500 KB per request payload**; `validation_error` on breach.
- Property caps per request: rich text `text.content` 2,000 chars; URLs 2,000; emails/phones 200; equation 1,000; arrays (incl. rich text) 100 elements; multi-select 100 options; relation 100 pages; people 100 users.
- Structural pain: reading a workspace requires recursive traversal (database → pages → blocks → children), multiplying requests against the 3 req/s cap. ([Indie Hackers](https://www.indiehackers.com/post/question-about-notion-api-rate-limits-2f2e806286), [dev.to](https://dev.to/kanta13jp1/notion-api-rate-limits-are-breaking-your-automation-heres-the-real-fix-o5p))
- Synced block content can't be updated via API; `link_preview` read-only; some block types return `unsupported`. ([Block reference](https://developers.notion.com/reference/block))
- File uploads: 5 MB/file Free, ~5 GB/file paid. ([Pricing](https://www.notion.com/pricing))

---

## 9. Pricing Tiers & Limits (2026)

([Notion pricing page](https://www.notion.com/pricing))

| | Free | Plus | Business | Enterprise |
|---|---|---|---|---|
| Price (per member/mo, monthly billing) | $0 | $10 | $20 ("Recommended") | Custom |
| Blocks | Unlimited for individuals; limited with 2+ members | Unlimited | Unlimited | Unlimited |
| File upload size | 5 MB | ~5 GB | ~5 GB | ~5 GB |
| Page history | 7 days | 30 days | 90 days | Unlimited |
| Guests | 10 | Unlimited | Unlimited | Unlimited |
| Notion AI / Meeting Notes / Research mode | Limited trial | Limited trial | Included (Agent, AI Meeting Notes, Enterprise Search) | Included + zero data retention with LLMs |
| Charts | 1 | Unlimited | Unlimited | Unlimited |
| Automations | Basic (buttons) | Basic | Custom database automations | Custom |
| Private teamspaces, granular DB permissions, page verification, SAML SSO | — | — | Yes | Yes |
| SCIM, audit log, advanced security, PDF export, analytics, domain management | — | — | — | Yes |
| Sites | 1 notion.site domain | 5 | 5 | 5 (custom domains are a paid add-on ~$8–10/domain/mo) |

- Yearly billing saves up to ~20%. Students/educators get Plus free (1 member). Custom Agents consume credits: $10 per 1,000 credits. Full refund within 3 days (monthly) / 30 days (annual).
- The old 1,000-block free limit now only applies to team trials / multi-member free workspaces — solo free users are unlimited. ([Thomas Frank](https://thomasjfrank.notion.site/Block-Basics-1d39743f7e184b3aa94cf0f63d97c5ae), [UseCarly](https://www.usecarly.com/blog/notion-free-plan-limits/))
- Database hard limits (250k rows, 500 properties, 2.5 MB property data/page, etc.) apply on **all** plans — they're platform limits, not paywalls. ([Optimize help](https://www.notion.com/help/optimize-database-load-times-and-performance))

---

## 10. Praised Features (with sources)

| Praised feature | Evidence / source |
|---|---|
| Flexibility & customization — build any workflow | G2 4.6/5 across ~11,900 reviews: "Users consistently praise Notion for its flexibility and ease of use" ([G2](https://www.g2.com/products/notion/reviews), [eesel](https://www.eesel.ai/blog/notion-review)) |
| All-in-one workspace (wiki + docs + projects in one) | Named G2 Leader / Best AI Software; "#1 knowledge base 3 consecutive years"; replaces tool sprawl ([G2 via LinkedIn](https://www.linkedin.com/posts/notionhq_notion-has-been-named-a-g2-leader-best-activity-7430655030757851136-WpUz), [Simplilearn](https://www.simplilearn.com/notion-project-management-article)) |
| Block editor & drag/drop "modular, structured, frictionless" | G2 Leader quote; "block-based building system, pages-inside-pages" ([eesel review](https://www.eesel.ai/blog/notion-review)) |
| Databases: multiple views of one dataset, filters, relations | Reviewer praise for "powerful databases with filters/views" ([eesel](https://www.eesel.ai/blog/notion-review)), product marketing ([notion.com/product/projects](https://www.notion.com/product/projects)) |
| Templates ecosystem lowers setup barrier | Official + community galleries; meeting-notes template roundups ([ClickUp](https://clickup.com/blog/notion-meeting-notes-templates/), [Notion templates](https://www.notion.com/templates/category/meetings)) |
| Ease of use / intuitive organization | "It's an app that lets you keep your notes organized, with a high level of customization. It's easy to use, intuitive" ([Capterra](https://www.capterra.com/p/186596/Notion/reviews/)) |
| Collaboration — comments, mentions, sharing, Sites | Reviewers cite collaboration + strong forms/AI/integrations, 4.5/5 sample review ([G2](https://www.g2.com/products/notion/reviews)) |
| Generous free plan (unlimited solo blocks, 10 guests) | [UseCarly](https://www.usecarly.com/blog/notion-free-plan-limits/), [Thomas Frank](https://thomasjfrank.notion.site/Block-Basics-1d39743f7e184b3aa94cf0f63d97c5ae) |
| Fast/ROI: 79% 5-star; 58% see ROI within 6 months | [eesel G2 analysis](https://www.eesel.ai/blog/notion-review) |

---

## 11. Complaints & Weaknesses + Technical Root Causes (with sources)

| Complaint / weakness | Specifics & technical root cause | Sources |
|---|---|---|
| Slowness at scale — large databases | "Databases with 150+ rows are unusable; a journal page takes a minute to open"; 3,000–4,000+ record DBs slow, worse with many relations; tables lazy-load ~50 rows at a time | Root cause: client must fetch/hydrate/render thousands of block records; formulas/rollups/relations recompute on view load (see §12) | [Reddit "too slow, getting worse"](https://www.reddit.com/r/Notion/comments/1ofxaiz/notion_is_too_slow_and_the_problem_is_getting/), [Match VS](https://match-vs.com/en/tool/notion), [Reddit](https://www.reddit.com/r/Notion/comments/tkus08/notion_is_so_slow_it_is_almost_unusable/) |
| Slowness even without formulas / medium docs | ~30-page documents lag; input latency on every keystroke series | Root cause: cloud round-trip per transaction + block-per-line data model | [Reddit 12322on](https://www.reddit.com/r/Notion/comments/12322on/i_find_notion_too_slow_for_any_serious_work_why/), [Reddit 129ylet](https://www.reddit.com/r/Notion/comments/129ylet/ok_but_seriously_notion_is_incredibly_slow_for/) |
| Slow search (multi-second "Quick Find") | "Search Can Be Slow in Large Workspaces" is a headline con; users report 6–10s loads | Root cause: server-side Quick Find index + permission-filtered cloud query per keystroke session; no local full-text index of all content | [Knowledgebase.net](https://www.knowledgebase.net/software/notion-review), [Reddit](https://www.reddit.com/r/Notion/comments/12322on/i_find_notion_too_slow_for_any_serious_work_why/) |
| Relations/rollups/formula recomputation | Official guidance: avoid complex sorts/filters on title/text/formula/rollup props; avoid formula→formula→rollup chains; dashboards (many inline DBs) are slowest pages | Root cause: derived values recomputed at load time, multiplied across linked views | [Notion Help: Optimize DB load](https://www.notion.com/help/optimize-database-load-times-and-performance), [Falconer](https://falconer.com/guides/why-is-notion-slow/) |
| Block bloat | Every line/image/table row = separate block record with metadata; platform passed 200B blocks | Root cause: block-per-line architecture trades document size for drag/drop flexibility | [Falconer](https://falconer.com/guides/why-is-notion-slow/), [Fabric](https://fabric.so/blog/why-notion-is-slow) |
| Deep page trees / navigation sprawl | Hundreds of pages nested 3+ levels; "the tree is the bottleneck, not the editor" | Root cause: sidebar tree renders/queries large graphs; recents/search compensate | [Falconer](https://falconer.com/guides/why-is-notion-slow/) |
| Weak mobile app | Laggy typing, slow loads, glitchy; mobile behind desktop; no detailed version diff on mobile | Root cause: same heavy client architecture on constrained devices | [Fibery aggregated reviews](https://fibery.io/openion/notion-2), [Hack'celeration](https://hackceleration.com/labs/review/notion) |
| Offline is limited / regression | Offline mode shipped Aug 2025 but "widely considered incomplete": DB offline sync caches only the **first 50 pages of the first view**; users report 12+ s page loads and "unbearably slow since the offline update"; merge-conflict risk unresolved | Root cause: cache bolted onto a cloud-first architecture, not local-first | [Taskade review](https://www.taskade.com/blog/notion-review), [Reddit offline thread](https://www.reddit.com/r/Notion/comments/1muinn8/its_official_offline_mode/), [Reddit](https://www.reddit.com/r/Notion/comments/1ng38hl/), [Notion offline guide](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know) |
| AI per-user add-on pricing | ~$8–10/user add-on originally; 2025 rebundling made full AI Business-only; Plus users can't buy AI at all; "like a scam"; Enterprise ~40% hikes | Business/packaging decision, not technical | [Reddit 1klq9r9](https://www.reddit.com/r/Notion/comments/1klq9r9/notion_pricing_update_no_more_ai_for_plus_accounts/), [Reddit 1pcvtli](https://www.reddit.com/r/Notion/comments/1pcvtli/notion_ai_is_too_expensive_for_users_who_only/), [Reddit 1od2cew](https://www.reddit.com/r/Notion/comments/1od2cew/anyone_with_notion_enterprise_been_hit_with_a_40/) |
| Permissions "not granular enough" + edge leaks | Reviewers want finer-grained access; "edit content" users can expose restricted DB rows via crafted views/filters; published sites leak contributor identities in metadata | Permission graph evaluated server-side at query time; publication pipeline copies metadata | [Knowledgebase.net](https://www.knowledgebase.net/software/notion-review), [Reddit 1irg7qy](https://www.reddit.com/r/Notion/comments/1irg7qy/users_can_expose_database_information_with_edit/), [Sites help](https://www.notion.com/help/public-pages-and-web-publishing) |
| Compliance tier-gating (HIPAA/BAA, EU residency) | BAA only via Enterprise; EU data residency Enterprise-only; most data on US servers → GDPR/Schrems II concerns | Hosting/compliance posture, not product | [Compliancy Group](https://compliancy-group.com/is-notion-hipaa-compliant/), [Docsie comparison](https://www.docsie.io/solutions/vs/guidde-vs-notion-enterprise/), [Notion security](https://notion.com/security) |
| Formula limits & performance | Formulas can't safely span many relation layers; heavy relation formulas slow DBs; no server-side compute for formula columns | Root cause: formulas evaluated per-row at render time on client | [Reddit 1iknlji](https://www.reddit.com/r/Notion/comments/1iknlji/formulas_in_automations_completely_transformed_my/), [Optimize help](https://www.notion.com/help/optimize-database-load-times-and-performance) |
| No local-first / data ownership | Export takes up to 30 hours, links expire in 7 days, exports are messy; community doubts server-centric design can ever do true offline CRDT merges | Root cause: single cloud source of truth; client is a cache | [Export help](https://www.notion.com/help/export-your-content), [Unmarkdown](https://unmarkdown.com/blog/notion-export-broken), [Reddit 1e0qkn6](https://www.reddit.com/r/Notion/comments/1e0qkn6/) |
| API throughput (3 req/s) | Bulk ops require recursion (DB→page→block→children) against a 3 req/s + workspace-shared cap; integrations break | Server-side protection of the shared monolith | [Request limits](https://developers.notion.com/reference/request-limits), [dev.to](https://dev.to/kanta13jp1/notion-api-rate-limits-are-breaking-your-automation-heres-the-real-fix-o5p), [Indie Hackers](https://www.indiehackers.com/post/question-about-notion-api-rate-limits-2f2e806286) |
| Learning curve / structure lock-in | "Works best if you adapt to Notion's structure"; initial setup complexity | Product philosophy | [Capterra](https://www.capterra.com/p/186596/Notion/reviews/), [Knowledgebase.net](https://www.knowledgebase.net/software/notion-review) |

---

## 12. Technical Causes of Slowness (what Prodmax's local SQLite architecture must counter)

Four structural causes, corroborated by Notion's own engineering blog, help center, and third-party analyses:

1. **Block bloat.** Every line/list item/table row is its own record with metadata; long pages mean thousands of records to fetch, hydrate, and render. Notion has surpassed **200 billion blocks** platform-wide. Notion's own fix advice is to split large pages — i.e., the data model is the problem. ([Falconer](https://falconer.com/guides/why-is-notion-slow/), [Notion blog](https://www.notion.com/blog/data-model-behind-notion))
2. **Database recomputation.** Linked views, formulas, rollups, and relations recompute when a page opens; formula→formula→rollup chains compound; every visible inline database listens for updates, so dashboards are slowest. Notion's official guidance: fewer properties, filter on simple props, avoid stacking inline DBs. ([Optimize help](https://www.notion.com/help/optimize-database-load-times-and-performance), [Falconer](https://falconer.com/guides/why-is-notion-slow/))
3. **Cloud round-trips.** Cloud-first design: edits batch into transactions, POST to `/saveTransactions`; each client holds a WebSocket to MessageStore, refetches stale records via `syncRecordValues`; page loads use `loadPageChunk`, which "descends... down the content tree" and in the worst case "might need many trips to the database as it recursively crawls down the tree." Backend is a sharded Postgres monolith (~480 logical shards). Keystrokes render locally in milliseconds, but opens/search/sync all pay network latency. ([Notion blog](https://www.notion.com/blog/data-model-behind-notion), [Relbis Labs](https://labs.relbis.com/blog/2024-04-18_notion_backend/), [Falconer](https://falconer.com/guides/why-is-notion-slow/))
4. **Deep page trees / sprawl.** Sidebar tree navigation over hundreds of nested pages becomes the bottleneck; search becomes the only fast path and search itself is server-side. ([Falconer](https://falconer.com/guides/why-is-notion-slow/))

Supporting numbers: users notice latency past 1s and disengage past 10s (NN/g cited by Falconer); Notion AI Q&A median time-to-first-token 18.3s; official DB limits (250k rows / 500 props / 2.5 MB per page) exist explicitly "to ensure the best database performance for all users" — i.e., the cloud service degrades before those caps.

---

## 13. Edge Cases (to test/handle in Prodmax)

- **Concurrent editing**: Notion resolves edits via server-validated transactions (load-before → apply → validate permissions/coherence → commit); clients converge through WebSocket version pushes. There are no CRDTs; offline merge conflicts remain a known unsolved risk ("sync issues... missing content" after offline mode). ([Notion blog](https://www.notion.com/blog/data-model-behind-notion), [Reddit offline thread](https://www.reddit.com/r/Notion/comments/1muinn8/its_official_offline_mode/))
- **Paste from Word / Google Docs**: tables with merged cells break or fail; colors, dividers, alignment, suggestions, others' comments are stripped; Notion itself recommends simplifying source tables or importing .docx instead of pasting; pasting FROM Notion elsewhere can emit "weird markup" text; AI/markdown sources need formatting normalization. ([Import help](https://www.notion.com/help/import-data-into-notion), [Reddit](https://www.reddit.com/r/Notion/comments/h9v4mt/is_it_possible_to_copypaste_text_from_google_docs/), [Latenode](https://community.latenode.com/t/notion-formating-issue-with-ai-generated-content/19780))
- **Emoji / unicode**: custom emoji don't render in PDF export; page icons often emoji (custom icon libraries common); CJK search matching still incomplete. ([Export help](https://www.notion.com/help/export-your-content), [Search help](https://www.notion.com/help/search))
- **Huge pages**: multi-thousand-block pages are slow to open and export; page property data capped at 2.5 MB; >1,000-item databases exhibit mid-collection insert anomaly; API arrays capped at 100 elements (write chunking required). ([Optimize help](https://www.notion.com/help/optimize-database-load-times-and-performance), [Intro to databases](https://www.notion.com/help/intro-to-databases))
- **Synced block cycles**: originals must exist before duplicates; >10 copies + "Unsync all"/delete-original destroys all copies with no undo; API cannot edit synced content; syncing across permission boundaries hides content from users without access to the original page. ([Synced blocks help](https://www.notion.com/help/synced-blocks), [API reference](https://developers.notion.com/reference/block))
- **Permission edges**: broadest-access-wins inheritance; @-mention of a user without access silently doesn't notify; sub-pages published when parent publishes; published sites expose contributor names/emails; expired-link sharing; guest invite auto-failure converting to member invite; "Can edit content" users can surface restricted rows via linked views/filters. ([Sharing help](https://www.notion.com/help/sharing-and-permissions), [Comments help](https://www.notion.com/help/comments-mentions-and-reminders), [Sites help](https://www.notion.com/help/public-pages-and-web-publishing), [Reddit 1irg7qy](https://www.reddit.com/r/Notion/comments/1irg7qy/users_can_expose_database_information_with_edit/))
- **Trash/history edges**: trash is 30 days default then 30 more hidden; no bulk empty; version snapshots every ~10 min mean up to ~10 min of edits can be lost between snapshots; Enterprise retention overrides. ([Delete & restore](https://www.notion.com/help/duplicate-delete-and-restore-content))
- **Windows specifics**: ZIP export paths >260 chars break Explorer extraction (Notion documents 7-Zip workaround). ([Export help](https://www.notion.com/help/export-your-content))

---

## Implications for Prodmax

1. **Implement the block model, but store it locally.** Keep Notion's graph model (id, type, props, content array, parent pointer — it powers drag/drop, turn-into, nesting, and permissions), but persist rows in a local SQLite database so a page open is a single indexed query, not `loadPageChunk` recursive cloud crawls. ([Notion's own architecture](https://www.notion.com/blog/data-model-behind-notion) is the thing to beat.)
2. **Counter block bloat with document-level storage + lazy rendering.** Store paragraphs as rich-text rows but batch-fetch a page in one SELECT (id range / parent index), virtualize rendering, and collapse toggle children until expanded — Notion's worst case is thousands of network-hydrated records ([Falconer](https://falconer.com/guides/why-is-notion-slow/)); Prodmax's worst case should be one fast local read.
3. **Build search on SQLite FTS5 from day one.** Notion's permission-filtered server search is its most-complained-about surface (6–10s loads); an indexed local full-text index (titles + body + property values, one consistent answer across docs and issues — fixing Notion's split workspace-vs-database search behavior) is a headline differentiator.
4. **Materialize views incrementally, not at load time.** Notion recomputes formulas/rollups/linked views on every open (their own help admits it). Prodmax should maintain incremental indexes/triggers in SQLite: recompute only affected rows on write, pre-aggregate rollups, and never block page paint on derived values.
5. **Implement the full database surface but simplify the edges**: table/board/list/calendar/timeline/gallery views; property types text/number/select/multi/status/date/person/checkbox/URL/files/formula/relation/rollup/timestamps; filters with nested groups (cap at 3 layers like Notion); sub-items via self-relation; dependencies with the 3 date-shift modes. Simplify: skip 250k-row-scale concerns initially, but keep Notion's published ceilings (500 properties, 2.5 MB/page) in mind as validation thresholds.
6. **Relations/rollups need a reactive invalidation graph.** Track reverse references (backlink tables) in SQLite so a change to a source row marks exactly the dependent rollups/formulas dirty — avoiding both Notion's full-recompute and stale caches.
7. **Native templates + recurring schedules are cheap wins.** Database templates with repeat (daily/weekly/monthly) drive retention (meeting notes, weekly reviews); implement as a local scheduler writing pre-structured pages. ([Notion guide](https://www.notion.com/help/guides/automate-work-repeating-database-templates))
8. **Automations: implement page-added/property-edited triggers with edit-property/add-page/notify actions, but document and enforce the no-chaining rule** (Notion's 3-second multi-trigger window failure is a trap to avoid — use explicit trigger timestamps).
9. **Comments/mentions/inbox parity**: inline + page comments, resolve/reopen, @person/@page/@date mentions, unified inbox — but notify on ALL mentions and tell the user when a mention target lacks access (Notion's silent no-notify is a documented edge complaint).
10. **Local-first sync design solves Notion's offline crisis.** Notion's offline mode (50-page DB cache cap, sync regressions) fails because offline was bolted onto a cloud architecture. Prodmax should make the local SQLite store the source of truth with a sync log/CRDT layer (or oplog with deterministic merge), making offline the default rather than a feature.
11. **Version history everywhere, locally.** Notion gates 7/30/90/unlimited days by price tier; Prodmax can snapshot cheaply in SQLite (every save or 10-min windows) and offer long/unlimited local history for free — a direct pricing-table attack.
12. **Ship a real importer roadmap**: Markdown, CSV, HTML, .docx, Evernote, Trello, Confluence are table stakes; Notion's importers lose formatting (merged cells, colors, suggestions). A high-fidelity Google Docs/Word paste pipeline alone would win switchers. Export must be clean Markdown/CSV/HTML (Notion's messy export spawned third-party companies).
13. **Flatten the tree.** Counter deep-page-tree sprawl with strong recents/pins, saved searches (Notion lacks customizable recents), and "In page" scoped navigation; sidebar should be O(visible nodes), querying an indexed materialized path table.
14. **Do not gate performance.** Every Notion performance limit exists to protect shared cloud infrastructure; a local-first product has none of those constraints — make "instant at any size" the brand promise (the empty space in Notion's review tables).
15. **Permission model to adopt**: page-level view/comment/edit with inheritance and broadest-wins, plus database "edit content" split (structure vs data) — but compute permissions from the local block graph deterministically and close the linked-view leak (filter results checked against the viewer's row-level access before rendering).

---

### Source index (primary)

Official Notion: [Block API reference](https://developers.notion.com/reference/block) · [Request limits](https://developers.notion.com/reference/request-limits) · [Synced blocks](https://www.notion.com/help/synced-blocks) · [Delete & restore](https://www.notion.com/help/duplicate-delete-and-restore-content) · [Links & backlinks](https://www.notion.com/help/create-links-and-backlinks) · [Intro to databases](https://www.notion.com/help/intro-to-databases) · [Views/filters/sorts](https://www.notion.com/help/views-filters-and-sorts) · [Sub-items & dependencies](https://www.notion.com/help/tasks-and-dependencies) · [Database automations](https://www.notion.com/help/database-automations) · [Optimize DB performance](https://www.notion.com/help/optimize-database-load-times-and-performance) · [Formulas 2.0](https://www.notion.com/help/guides/new-formulas-whats-changed) · [Search](https://www.notion.com/help/search) · [Enterprise Search](https://www.notion.com/help/enterprise-search) · [Sharing & permissions](https://www.notion.com/help/sharing-and-permissions) · [Comments & mentions](https://www.notion.com/help/comments-mentions-and-reminders) · [Web publishing](https://www.notion.com/help/public-pages-and-web-publishing) · [Import](https://www.notion.com/help/import-data-into-notion) · [Export](https://www.notion.com/help/export-your-content) · [Pricing](https://www.notion.com/pricing) · [Releases](https://www.notion.com/releases) ([2025-05-13](https://www.notion.com/releases/2025-05-13), [2026-03-26](https://www.notion.com/releases/2026-03-26), [2026-04-14](https://www.notion.com/releases/2026-04-14)) · [Data model blog](https://www.notion.com/blog/data-model-behind-notion) · [Offline guide](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know)

Third-party / community: [Falconer: Why is Notion slow](https://falconer.com/guides/why-is-notion-slow/) · [Fabric](https://fabric.so/blog/why-notion-is-slow) · [Relbis Labs backend analysis](https://labs.relbis.com/blog/2024-04-18_notion_backend/) · [G2](https://www.g2.com/products/notion/reviews) · [Capterra](https://www.capterra.com/p/186596/Notion/reviews/) · [eesel AI autofill + G2 analysis](https://www.eesel.ai/blog/notion-ai-autofill) · [Knowledgebase.net review](https://www.knowledgebase.net/software/notion-review) · [Taskade offline review](https://www.taskade.com/blog/notion-review) · [NotionApps properties](https://www.notionapps.com/blog/notion-database-properties-explained/) · [Notion VIP Formulas 2.0](https://www.notion.vip/insights/notion-formulas-2-0-the-definitive-introduction) · [Unmarkdown export critique](https://unmarkdown.com/blog/notion-export-broken) · [Breeze export limits](https://www.breeze.pm/articles/export-from-notion) · [Thomas Frank block basics](https://thomasjfrank.notion.site/Block-Basics-1d39743f7e184b3aa94cf0f63d97c5ae) · [Compliancy Group HIPAA](https://compliancy-group.com/is-notion-hipaa-compliant/) · Reddit threads: [slowness 1ofxaiz](https://www.reddit.com/r/Notion/comments/1ofxaiz/), [12322on](https://www.reddit.com/r/Notion/comments/12322on/), [tkus08](https://www.reddit.com/r/Notion/comments/tkus08/), [129ylet](https://www.reddit.com/r/Notion/comments/129ylet/), [AI pricing 1klq9r9](https://www.reddit.com/r/Notion/comments/1klq9r9/), [1pcvtli](https://www.reddit.com/r/Notion/comments/1pcvtli/), [1od2cew](https://www.reddit.com/r/Notion/comments/1od2cew/), [offline 1muinn8](https://www.reddit.com/r/Notion/comments/1muinn8/), [1ng38hl](https://www.reddit.com/r/Notion/comments/1ng38hl/), [API limits xfufed](https://www.reddit.com/r/Notion/comments/xfufed/)
