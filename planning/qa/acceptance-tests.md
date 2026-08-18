# Prodmax Acceptance Tests — Phase 4 Exit Gate

**Doc owner:** consolidation agent | **Date:** 2026-08-18 | **Total tests:** 126 (AT-001 … AT-126)
**Rule:** the build is DONE only when every test here is PASS, `npm run check` / `npm test` / `npm run e2e` / `npm run build` are clean, and `planning/qa/defect-log.md` shows zero open material defects.

**Test fields**
- **Preconditions** — state required before steps run.
- **Steps** — numbered manual steps with exact UI targets (menu names, buttons, keys in `backticks`).
- **Expected** — the observable pass condition.
- **Automated** — mapping: `vitest unit` (pure logic), `vitest integration` (service layer + real SQLite), `playwright e2e` (browser), `manual-browser` (agent-driven via chrome-devtools MCP / browser-use; logged manually).
- **Severity** — `blocker` (no ship), `major` (ship-blocking for the owning module's sign-off), `minor`.

**Standard test accounts** (seeded by `npm run seed`, used throughout): `owner@prodmax.test` (workspace PROD "Prodmax HQ", owner), `admin@prodmax.test`, `member@prodmax.test`, `guest@prodmax.test` (guest of team "Core", member of nothing else), plus `owner2@prodmax.test` (owner of second workspace "Sidegig" with private issue `SID-1`). Second browser profile/session is referred to as **Session B**.

---

## Group 1 — Auth & Sessions (AT-001 … AT-007)

### AT-001 — Register a new account
- **Preconditions:** fresh database; no session.
- **Steps:** 1. Go to `/` → land on `/login`. 2. Click **"Create account"**. 3. Enter `owner@prodmax.test` / `Passw0rd!long` / "Opal Owner"; click **Sign up**.
- **Expected:** account created; redirected to onboarding wizard (AT-008); session cookie set; duplicate email registration later returns 400 VALIDATION with generic message.
- **Automated:** playwright e2e `auth/register.spec.ts` + vitest integration (duplicate email).
- **Severity:** blocker

### AT-002 — Login with valid and invalid credentials
- **Preconditions:** account from AT-001 exists; logged out.
- **Steps:** 1. Go to `/login`; submit wrong password → error toast "Email or password is incorrect". 2. Submit correct credentials. 3. Reload the page.
- **Expected:** step 1 shows the SAME generic error for unknown email and wrong password (no user enumeration); step 2-3 user stays signed in.
- **Automated:** playwright e2e `auth/login.spec.ts`.
- **Severity:** blocker

### AT-003 — Password & registration validation
- **Preconditions:** logged out.
- **Steps:** 1. Attempt registration with password `short`. 2. Attempt with invalid email `nope`. 3. Attempt 11 rapid logins with wrong password.
- **Expected:** inline field errors from zod (min 10 chars, valid email); after the rate limit (10/min/IP) the 11th returns 429 with `Retry-After` and the UI shows "Too many attempts — try again later".
- **Automated:** vitest integration (validation + rate limit) + playwright e2e (field errors).
- **Severity:** blocker

### AT-004 — Logout and logout-all
- **Preconditions:** signed in on two browsers (Session A and B).
- **Steps:** 1. In Session A open **Settings → Account → Sessions** (device list visible). 2. Click **"Sign out all other sessions"**. 3. Reload Session B.
- **Expected:** Session B is logged out; Session A remains; sessions list shows one active session.
- **Automated:** playwright e2e `auth/sessions.spec.ts`.
- **Severity:** blocker

### AT-005 — Change password
- **Preconditions:** signed in as `member@prodmax.test`.
- **Steps:** 1. **Settings → Account → Password**. 2. Enter wrong current password → error. 3. Enter correct current + new password, save. 4. Logout, login with new password.
- **Expected:** wrong-current rejected; new password works; old password rejected afterwards.
- **Automated:** playwright e2e `auth/password.spec.ts`.
- **Severity:** blocker

### AT-006 — Session expiry behavior
- **Preconditions:** session with expiry manipulated to 1 minute (dev helper `POST /api/dev/expire-session` or seeded short session).
- **Steps:** 1. Wait past expiry. 2. Click any navigation link.
- **Expected:** API returns 401; UI redirects to `/login` preserving the intended destination; after re-login the user lands where they were going.
- **Automated:** vitest integration + manual-browser.
- **Severity:** major

### AT-007 — Authenticated shell guard
- **Preconditions:** logged out; direct URL to `/ws/prodmax/issues` on clipboard.
- **Steps:** 1. Paste the URL while logged out. 2. Log in.
- **Expected:** redirect to `/login?next=…`; post-login lands on the original issues view.
- **Automated:** playwright e2e `auth/guard.spec.ts`.
- **Severity:** major

## Group 2 — Onboarding (AT-008 … AT-009)

### AT-008 — First-run wizard completes
- **Preconditions:** brand-new account (no workspace).
- **Steps:** 1. After signup, wizard shows steps: workspace name "Prodmax HQ" (slug `prodmax`), timezone, default team key `PRO` + name "Core". 2. Choose "Include sample content". 3. Click **Finish**.
- **Expected:** workspace + team + 5 workflow states created; creator is owner; sample issues and one sample page exist; keyboard-shortcut tour card appears once; landing on My Issues.
- **Automated:** playwright e2e `onboarding/wizard.spec.ts`.
- **Severity:** blocker

### AT-009 — Skip sample content; default team correctness
- **Preconditions:** second new account.
- **Steps:** 1. Run wizard choosing "Start empty". 2. Inspect sidebar teams and **Settings → Teams**.
- **Expected:** exactly one team "Core" (key PRO) with default states Backlog/Todo/In Progress/Done/Canceled; empty-state illustrations (canvasui) shown on Issues/Docs; second workspace member later still gets unlimited teams (no caps).
- **Automated:** playwright e2e `onboarding/empty.spec.ts`.
- **Severity:** major

## Group 3 — Workspaces, Members, Roles & Invites (AT-010 … AT-016)

### AT-010 — Create and switch workspaces
- **Preconditions:** signed in as `owner@prodmax.test`.
- **Steps:** 1. Click workspace name (top-left) → **"New workspace"**. 2. Create "Sidegig" (slug `sidegig`). 3. Switch back to Prodmax HQ via the switcher.
- **Expected:** switcher lists both; per-workspace navigation state preserved (last view restored); workspace settings show correct name/slug; deleting requires owner + typed confirmation (AT-015).
- **Automated:** playwright e2e `workspaces/switch.spec.ts`.
- **Severity:** blocker

### AT-011 — Role capability matrix (owner/admin/member)
- **Preconditions:** all seeded accounts in Prodmax HQ.
- **Steps:** For each of `owner`, `admin`, `member`: 1. Check sidebar shows/hides **Settings → Members / API keys / Webhooks / Import**. 2. As `member`, `POST /api/workspaces/:id/members` via fetch console → expect 403. 3. As `admin`, open team settings.
- **Expected:** UI affordances match the architecture §7 matrix exactly (member: no admin pages; admin: everything except delete-workspace/owner-transfer; owner: all).
- **Automated:** playwright e2e `roles/matrix.spec.ts` + vitest integration (per-role service checks).
- **Severity:** blocker

### AT-012 — Guest account scope
- **Preconditions:** `guest@prodmax.test` accepted a guest invite to team "Core" only; a second team "Design" exists with issue `DES-1`.
- **Steps:** 1. Login as guest. 2. Open All Issues. 3. Navigate to `/ws/prodmax/pages` (Docs) manually. 4. Search for `DES-1`.
- **Expected:** only Core issues visible; Docs returns 403 UI ("Guests don't have Docs access"); `DES-1` absent from search and from direct URL `/issue/DES-1` (404 for guest).
- **Automated:** playwright e2e `roles/guest.spec.ts` + vitest integration.
- **Severity:** blocker

### AT-013 — Invite lifecycle
- **Preconditions:** owner signed in.
- **Steps:** 1. **Settings → Members → Invite**: invite `newbie@prodmax.test` as member → invite link + code shown. 2. Copy link; in Session B (logged out) open it → signup/login → membership active. 3. Create a second invite; click **Revoke**; try the link.
- **Expected:** expired/revoked link shows "Invite no longer valid"; accepted invite disappears from pending list; guest invites require team selection; invites expire after 7 days.
- **Automated:** playwright e2e `members/invite.spec.ts` + vitest integration (expiry).
- **Severity:** blocker

### AT-014 — Role change and suspension
- **Preconditions:** `member@prodmax.test` active.
- **Steps:** 1. As owner, change member → admin; member's next page load shows admin settings. 2. Change back to member. 3. Suspend the member. 4. As the suspended member (Session B), attempt any API write.
- **Expected:** role change reflected without re-login on next fetch; suspended user reads nothing (401/403 per endpoint), profile retained in history.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** blocker

### AT-015 — Owner transfer & workspace delete
- **Preconditions:** two owners impossible; owner + admin exist.
- **Steps:** 1. As owner, **Settings → Danger zone → Transfer ownership** to admin (type-to-confirm workspace name). 2. Former owner is now admin. 3. As the new owner, **Delete workspace** (type `prodmax`).
- **Expected:** transfer demotes former owner to admin; delete cascades all data (verify: DB file row counts for `issues` where workspace=prodmax = 0 after purge job); non-owner never sees Danger-zone delete.
- **Automated:** vitest integration + manual-browser (destructive confirm flows).
- **Severity:** blocker

### AT-016 — Admin-set password reset
- **Preconditions:** admin signed in; member forgot password.
- **Steps:** 1. **Settings → Members → ⋯ → Reset password** for the member; temp password displayed once. 2. Member logs in with temp password. 3. Member changes password.
- **Expected:** temp password works exactly once and is not stored in plaintext anywhere; forced change recommended via banner.
- **Automated:** vitest integration + manual-browser.
- **Severity:** major

## Group 4 — Issues CRUD, Identifiers & History (AT-017 … AT-024)

### AT-017 — Workflow states editor
- **Preconditions:** owner in **Settings → Teams → Core → Workflow**.
- **Steps:** 1. Add status "In Review" (category Started). 2. Drag "In Review" above "In Progress" (reorder within category). 3. Attempt to drag it into the Completed category. 4. Attempt to delete the only Backlog status. 5. Set default new-issue state to "Todo".
- **Expected:** custom status created with color; intra-category reorder persists; cross-category drag rejected; last-status-in-category delete blocked; new issues default to Todo.
- **Automated:** playwright e2e `issues/states.spec.ts` + vitest integration (category constraints).
- **Severity:** blocker

### AT-018 — Labels: create, apply, archive
- **Preconditions:** workspace "Prodmax HQ".
- **Steps:** 1. Create workspace label "bug" (red) and team label "Core/frontend" (blue). 2. Add both to issue `PRO-1` via `L` shortcut. 3. Archive "bug"; try adding it to a new issue. 4. Create label named "priority".
- **Expected:** archive keeps "bug" on PRO-1 but removes it from the picker for new use; reserved name "priority" rejected with clear error; issue shows both label chips.
- **Automated:** playwright e2e `issues/labels.spec.ts` + vitest integration.
- **Severity:** blocker

### AT-019 — Quick create, properties, drafts
- **Preconditions:** member signed in; on All Issues.
- **Steps:** 1. Press `C` → modal opens; type title "Fix login crash"; press `Cmd/Ctrl+Enter`. 2. Verify identifier assigned (PRO-N) and state = default. 3. Press `C` again; type "half-typed"; press `Esc` → choose **Save draft**. 4. Navigate away and back to the modal; then open **Drafts** in sidebar.
- **Expected:** issue created with title+state only; draft preserved across navigation and logout (server-side); pressing `I` on the new issue assigns to me and auto-subscribes (creator already subscribed).
- **Automated:** playwright e2e `issues/create.spec.ts` + vitest integration (auto-subscribe).
- **Severity:** blocker

### AT-020 — Full-screen editor & property completeness
- **Preconditions:** issue from AT-019 exists.
- **Steps:** 1. Press `V` on it (full-screen). 2. Set priority `Shift+3` (High), due date `Shift+D` (+7d), estimate 3, project, milestone, cycle. 3. Write markdown description with a checklist; save.
- **Expected:** all properties persist and render as chips on the list row; description preview renders markdown; every property settable without mouse.
- **Automated:** playwright e2e `issues/editor.spec.ts`.
- **Severity:** blocker

### AT-021 — Sub-issues & attachments
- **Preconditions:** issue `PRO-2` open.
- **Steps:** 1. **+ Add sub-issue** three times. 2. In the sub-issue paste area, paste three lines of titles at once (bulk create). 3. Verify inheritance: sub-issue shows same project/priority as parent, labels NOT inherited. 4. Add a URL attachment (paperclip) to a comment; upload a small PNG file.
- **Expected:** bulk paste creates 3 sub-issues in order; inheritance rules hold; attachment link renders as card, file shows name+size; parent row shows sub-issue count.
- **Automated:** playwright e2e `issues/subissues.spec.ts` + vitest integration (inheritance).
- **Severity:** blocker

### AT-022 — Identifier allocation & team move
- **Preconditions:** team "Core" (PRO) with counter at N; second team "Design" (DES).
- **Steps:** 1. Create an issue → verify `PRO-N`. 2. Fire 5 concurrent `POST /api/issues` (console loop) → verify 5 unique sequential numbers, no duplicates. 3. Move `PRO-N` to Design via `Cmd/Ctrl+Shift+M`. 4. Visit `/issue/PRO-N`.
- **Expected:** concurrent creates produce N+1…N+5 uniquely; moved issue becomes `DES-M`; old URL/identifier redirects to the new issue and old ID still finds it via search; status remaps to nearest category; team labels dropped with a warning toast; move is undoable (`Cmd/Ctrl+Z`).
- **Automated:** vitest integration (concurrency + move semantics) + playwright e2e (redirect).
- **Severity:** blocker

### AT-023 — Relations & blocked→related downgrade
- **Preconditions:** issues A=`PRO-10`, B=`PRO-11`, C=`PRO-12`.
- **Steps:** 1. On A, `M B` (blocked by B) → banner "Blocked by PRO-11". 2. Add "related" to C. 3. Type `PRO-12` inside B's description → auto-related relation appears on B. 4. Complete B (state Done).
- **Expected:** A shows blocking banner; B shows inverse "blocking PRO-10"; after B completes, relation downgrades to "related" on both sides; duplicate-type relation only settable via merge flow (AT-050).
- **Automated:** vitest integration (downgrade rule) + playwright e2e.
- **Severity:** blocker

### AT-024 — Issue history & 3-minute grace
- **Preconditions:** fresh issue just created (< 3 min).
- **Steps:** 1. Within 3 minutes of creation, change priority and assignee. 2. Open **Activity** tab on the issue. 3. After 3 minutes, change state; re-check activity. 4. Edit description twice; open **⋯ → Description history**; restore version 1.
- **Expected:** grace-window edits appear only as part of "created" entry (no noise); post-grace state change logged with actor + old→new; description versions listed with timestamps and restorable.
- **Automated:** vitest integration (grace window) + playwright e2e (history UI).
- **Severity:** blocker

## Group 5 — Views, Filters, Layouts & Trash (AT-025 … AT-032)

### AT-025 — Filter bar with typed operators
- **Preconditions:** issues with varied priority/labels/assignees exist.
- **Steps:** 1. On All Issues press `F`. 2. Add filter **Priority is High**; then add second value → operator becomes "is either of". 3. Filter **Labels includes bug**. 4. Filter **Due date before end of month**. 5. Type "high" directly into the filter bar (quick filter).
- **Expected:** operators upgrade automatically; label filter uses includes-any; date picker emits before/after; typed quick-filter matches property names; result counts update live; `Shift+F` removes last, `Shift+Alt+F` clears all.
- **Automated:** playwright e2e `views/filters.spec.ts` + vitest unit (filter AST → SQL).
- **Severity:** blocker

### AT-026 — Trash, archive & undo in views
- **Preconditions:** issues `PRO-30` (open), `PRO-31` (completed).
- **Steps:** 1. Delete `PRO-30` (`Cmd/Ctrl+Delete`) → toast with **Undo**; press `Cmd/Ctrl+Z`. 2. Delete again; open **Archive/Trash** (`G X`); restore with `#`. 3. Manually archive `PRO-31`; check All Issues default view. 4. Set team auto-archive to 1 day (dev clock +1 day).
- **Expected:** undo restores issue + relations; trash page restores with full history intact; archived issues hidden from default views but searchable; auto-archive archives eligible completed issues and logs a system activity entry.
- **Automated:** playwright e2e `issues/trash.spec.ts` + vitest integration (auto-archive job).
- **Severity:** blocker

### AT-027 — Advanced filters (AND/OR nesting)
- **Preconditions:** mixed issue data.
- **Steps:** 1. In the filter bar click **+ Add group**. 2. Build: (Priority is High OR Priority is Urgent) AND (Labels includes bug). 3. Click any clause to edit it. 4. Attempt to nest 4 levels deep.
- **Expected:** nested groups evaluate correctly (verify against expected issue set); clicking a formula segment opens its editor; depth beyond 3 refused with hint.
- **Automated:** vitest unit (AST evaluation) + playwright e2e.
- **Severity:** major

### AT-028 — Grouping, board drag & sub-grouping
- **Preconditions:** board view of All Issues.
- **Steps:** 1. Group by **Status** (default board). 2. Drag a card from "Todo" to "In Progress". 3. Group by **Assignee**; drag an unassigned card onto a person's column. 4. Add sub-group by **Priority** (swimlanes). 5. Toggle group header count ↔ estimate sum; hide empty groups.
- **Expected:** drag mutates the issue's state/assignee (confirmed by activity entry); swimlanes render with sticky headers; header toggles work; empty groups hide; board/list toggle `Cmd/Ctrl+B` preserves filters.
- **Automated:** playwright e2e `views/board.spec.ts` + vitest integration (drag = property mutation).
- **Severity:** blocker

### AT-029 — Ordering incl. manual
- **Preconditions:** list view with ≥6 issues.
- **Steps:** 1. Sort by **Due date**; reverse direction. 2. Switch to **Manual** ordering; move an issue with `Alt+↑` and to top with `Alt+Shift+↑`; reverse manual sort. 3. Save as view "My order"; switch workspace-scope view and back.
- **Expected:** manual order is per-view (other views unaffected); reverse manual allowed; keyboard reorder persists and is shared (visible to Session B).
- **Automated:** playwright e2e `views/ordering.spec.ts` + vitest unit (fractional indexing).
- **Severity:** blocker

### AT-030 — Saved views CRUD & scopes
- **Preconditions:** filtered list from AT-029.
- **Steps:** 1. **Save view** (`Alt+V`) named "High-pri bugs", scope Workspace. 2. Star it (sidebar favorite). 3. As `member` (Session B), open the shared URL of the view. 4. Edit filters; confirm personal-layering prompt keeps the shared view intact.
- **Expected:** view in sidebar under team; favorites starred; URL sharing grants access only to existing members (no invite bypass); member edits create personal layer, not workspace mutation; owner can edit shared view, member cannot.
- **Automated:** playwright e2e `views/saved.spec.ts` + vitest integration (scope enforcement).
- **Severity:** blocker

### AT-031 — Display options & view URL
- **Preconditions:** any list view.
- **Steps:** 1. Press `Shift+V` (display options); hide ID and due date, show estimate. 2. Toggle wrapping. 3. **Set as default** (workspace default). 4. Open the view's URL in Session B.
- **Expected:** property visibility changes apply instantly; workspace default affects new views for members (who can layer personal prefs); URL reproduces identical layout + filters in Session B.
- **Automated:** playwright e2e `views/display.spec.ts`.
- **Severity:** major

### AT-032 — Table view & inline editing
- **Preconditions:** table view of All Issues.
- **Steps:** 1. Verify columns: ID (frozen), title, status, assignee, priority, labels, project, cycle, estimate. 2. Click status cell → pick new status inline. 3. Click assignee cell → pick member. 4. Toggle to board (`Cmd/Ctrl+B`) and back.
- **Expected:** inline edits save without opening the issue (activity confirms); frozen ID column while horizontal scrolling; layout toggle preserves scroll position and filters.
- **Automated:** playwright e2e `views/table.spec.ts`.
- **Severity:** blocker

## Group 6 — Bulk Ops & Keyboard (AT-033 … AT-037)

### AT-033 — Multi-select & bulk edit
- **Preconditions:** list with ≥5 issues.
- **Steps:** 1. Press `X` on rows 1 and 3; `Cmd/Ctrl+A` selects all; Shift+click for range. 2. With selection active press `S` → choose "Done". 3. Press `Shift+P` → assign project. 4. Right-click selection → **Archive**.
- **Expected:** selection chips show count; bulk state/project applies to all selected; bulk archive logs one activity entry per issue; counts update everywhere (board groups, insights counters).
- **Automated:** playwright e2e `issues/bulk.spec.ts` + vitest integration.
- **Severity:** blocker

### AT-034 — Bulk undo
- **Preconditions:** just completed AT-033's bulk archive.
- **Steps:** 1. Press `Cmd/Ctrl+Z` (or click **Undo** in toast).
- **Expected:** ALL issues from the bulk action restored to pre-action state (state, project, archive flag) via compensating actions; undo token invalid after use; activity log shows the compensation.
- **Automated:** vitest integration (compensating transaction) + playwright e2e.
- **Severity:** blocker

### AT-035 — Keyboard shortcut system
- **Preconditions:** keyboard-only; focus on issues list.
- **Steps:** 1. `K`/`J` navigate rows; `Return` opens issue; `Space` peeks. 2. `G I`, `G M`, `G E`, `G B`, `G P`, `G C`, `G V`, `G S` navigate to Inbox/My Issues/All Issues/Backlog/Projects/Cycles/Active cycle/Settings. 3. `O I` opens issue-search. 4. `?` opens shortcut help; search "priority". 5. Focus a text input; press `C`.
- **Expected:** every chord lands on the right surface; help is searchable and lists all bindings; single-key shortcuts do NOT fire while composing text.
- **Automated:** playwright e2e `keyboard/shortcuts.spec.ts`.
- **Severity:** blocker

### AT-036 — In-row property editing
- **Preconditions:** focus on a list row.
- **Steps:** 1. Press `P` → priority picker → choose Urgent. 2. Press `A` → assignee picker → choose me. 3. Press `L` → toggle a label. 4. Press `E` → rename title inline.
- **Expected:** all four mutations apply to the focused row without opening the issue, render immediately (optimistic), and reconcile with SSE within ~2 s in Session B.
- **Automated:** playwright e2e `keyboard/inrow.spec.ts`.
- **Severity:** blocker

### AT-037 — Command palette everything
- **Preconditions:** anywhere in the app.
- **Steps:** 1. `Cmd/Ctrl+K` opens palette. 2. Type "create issue" → run it. 3. Type "PRO" → issue results appear; `Return` opens top hit. 4. Type "settings members" → navigates. 5. Type "high priority" → filter action for current view offered. 6. `Esc` closes; focus returns to prior element.
- **Expected:** palette covers navigation, creation, view actions, settings, and search; keyboard-only completion; recent commands surface on empty query.
- **Automated:** playwright e2e `shell/palette.spec.ts`.
- **Severity:** blocker

## Group 7 — Cycles (AT-038 … AT-041)

### AT-038 — Cycle configuration & auto-creation
- **Preconditions:** owner; team Core without cycles.
- **Steps:** 1. **Settings → Teams → Core → Cycles**: enable, length 2 weeks, start Monday, no cooldown. 2. Save. 3. Check `G C` cycle list.
- **Expected:** current + future cycles auto-created (up to 15) with correct Mon 00:01 team-timezone boundaries; active cycle page (`G V`) opens.
- **Automated:** vitest integration (schedule generation, timezone math) + playwright e2e.
- **Severity:** blocker

### AT-039 — Cycle scoping & velocity data
- **Preconditions:** active cycle exists.
- **Steps:** 1. Add 3 issues to the active cycle (via `Shift+C` on issues). 2. Complete 2 of them. 3. Open the cycle page; check velocity stat and scope list.
- **Expected:** cycle shows 3 scoped, 2 completed; velocity (count) = 2; capacity estimate appears after ≥3 completed cycles, else falls back to member count; per-cycle stats visible.
- **Automated:** vitest integration + playwright e2e `cycles/scope.spec.ts`.
- **Severity:** blocker

### AT-040 — Rollover & recurring issues
- **Preconditions:** active cycle with 1 open + 1 completed issue; template "Weekly bug sweep" with recurrence weekly (dev clock available).
- **Steps:** 1. Advance dev clock past cycle end; trigger scheduler. 2. Inspect old and new cycles. 3. Advance past a recurring template's due; verify instance creation.
- **Expected:** open issue rolled into next cycle; completed issue stays; cycle marked completed with frozen snapshot (later edits don't change the snapshot, labeled "as of close"); recurring template created the next instance at 00:01 team timezone without altering prior instances.
- **Automated:** vitest integration (rollover + recurring scheduler) + manual-browser.
- **Severity:** blocker

### AT-041 — Cycle surgery
- **Preconditions:** active cycle.
- **Steps:** 1. Edit a future cycle's dates → saves. 2. **End current cycle early** → confirm dialog. 3. **Start next cycle today** → irreversible-confirm popup.
- **Expected:** early-end closes at end of current day; start-today completes in-progress cycle and moves open issues forward; both actions log system activity entries; confirmation copy states irreversibility.
- **Automated:** vitest integration + manual-browser.
- **Severity:** major

## Group 8 — Projects & Milestones (AT-042 … AT-046)

### AT-042 — Project CRUD, cross-team, lead, brief
- **Preconditions:** teams Core and Design exist.
- **Steps:** 1. `G P` → **New project** "Website revamp", lead = me, status Planned, target dates this quarter. 2. Add issues from BOTH teams (`Shift+P`). 3. Link a project brief page (create from Docs tab).
- **Expected:** project lists issues across teams with per-team grouping toggle; single lead displayed; brief page linked and editable; project color shows in sidebar favorites when starred.
- **Automated:** playwright e2e `projects/crud.spec.ts`.
- **Severity:** blocker

### AT-043 — Project progress computation
- **Preconditions:** project with 4 issues: 2 Done, 1 In Progress, 1 Todo (no estimates).
- **Steps:** 1. Open project → progress = 50% (2/4, unestimated counts 1). 2. Enable team estimates (Fibonacci) and set estimates 2/3/5/8 → progress re-weights by points. 3. Complete another issue in Session B.
- **Expected:** progress updates on write (materialized counter) without reload; estimate-weighted % correct; details sidebar (`Cmd/Ctrl+I`) matches list %.
- **Automated:** vitest integration (counter invalidation) + playwright e2e.
- **Severity:** blocker

### AT-044 — Project updates & staleness
- **Preconditions:** project from AT-042, lead = current user.
- **Steps:** 1. Post update: health **At risk** + note. 2. Advance dev clock beyond cadence + 3 days. 3. Check project list indicator.
- **Expected:** update appears in project timeline + subscribers' inboxes; "Update missing" grey indicator appears per rule; any member can post after the lead's first update.
- **Automated:** vitest integration + manual-browser.
- **Severity:** major

### AT-045 — Milestone CRUD & membership
- **Preconditions:** project exists.
- **Steps:** 1. Create milestones "Alpha" (target +14d) and "Beta". 2. Add 2 issues to Alpha via `Shift+M`. 3. Start one of them.
- **Expected:** Alpha shows "1 of 2 started, 0 completed"; current milestone gets highlight marker; milestone list reorderable; milestone cannot be shared across projects (picker scoped to project).
- **Automated:** playwright e2e `projects/milestones.spec.ts` + vitest integration.
- **Severity:** blocker

### AT-046 — Milestone filters & insights segment
- **Preconditions:** milestones from AT-045.
- **Steps:** 1. Filter issues by **Milestone: Next milestone**. 2. Complete remaining Alpha issue. 3. Open Insights; segment a chart by milestone.
- **Expected:** next-milestone filter tracks the earliest incomplete milestone; completing all Alpha issues marks it complete; insights segmentation by milestone renders.
- **Automated:** playwright e2e + vitest integration.
- **Severity:** major

## Group 9 — Triage (AT-047 … AT-050)

### AT-047 — Triage inbox & routing
- **Preconditions:** team Core triage enabled (**Settings → Teams → Core → Triage**); member has an issue template "Bug report".
- **Steps:** 1. Create an issue via `POST /api/issues` with an API key (integration path). 2. `G T` opens triage inbox. 3. Instantiate the "Bug report" template as a second issue. 4. Check All Issues default view.
- **Expected:** both issues land in the Triage status; triage queue lists them with age; default views exclude triage issues unless a status filter includes them; require-priority toggle (when on) blocks exit until priority set.
- **Automated:** vitest integration (routing rules) + playwright e2e `triage/inbox.spec.ts`.
- **Severity:** blocker

### AT-048 — Triage actions 1 / 2 / 3 / H
- **Preconditions:** ≥3 items in triage.
- **Steps:** 1. Focus item 1; press `1` → moves to default status (optionally add comment). 2. Focus item 2; press `3` (decline) → canceled + comment prompt. 3. Focus item 3; press `H` → snooze until tomorrow; create new activity on it.
- **Expected:** accept/decline apply with optional comments logged; snoozed item disappears until time elapses OR new activity arrives (whichever first); all actions keyboard-driven and logged in activity.
- **Automated:** playwright e2e `triage/actions.spec.ts` + vitest integration (snooze re-surface).
- **Severity:** blocker

### AT-049 — Duplicate merge flow
- **Preconditions:** `PRO-50` (canonical, has a file attachment) and triage item `PRO-51` (duplicate, has a link attachment).
- **Steps:** 1. On `PRO-51` press `2` → search/select `PRO-50` → confirm merge.
- **Expected:** `PRO-51` moves to terminal **Duplicate** status (not deletable status); its attachments transfer to `PRO-50`; `PRO-50` shows "Merged from PRO-51" banner linking back; relation of type duplicate recorded.
- **Automated:** playwright e2e `triage/merge.spec.ts` + vitest integration.
- **Severity:** blocker

### AT-050 — Merge undo & one-way direction
- **Preconditions:** merge from AT-049 just happened.
- **Steps:** 1. Press `Cmd/Ctrl+Z` (toast Undo). 2. Attempt to initiate merge FROM `PRO-50` INTO `PRO-51` (reverse).
- **Expected:** undo restores `PRO-51` to triage with its attachment back and removes the banner; direction is enforceably one-way (reverse option not offered); merge only initiates from the duplicate.
- **Automated:** vitest integration (compensating actions).
- **Severity:** major

## Group 10 — Docs, Page Tree, Templates & Embedded Views (AT-051 … AT-060)

### AT-051 — Page tree & block editor basics
- **Preconditions:** member signed in; Docs section visible.
- **Steps:** 1. **+ New page** "Engineering wiki"; add emoji icon 🛠. 2. Create sub-pages "Onboarding" and "Runbooks" via drag onto parent in sidebar. 3. Reorder sub-pages by drag. 4. In "Runbooks" type paragraphs; nest a bullet under a bullet (indent with `Tab`).
- **Expected:** tree nests and reorders instantly; icon shows in sidebar; indent is structural (nested child), not visual; deep-link URL per page stable.
- **Automated:** playwright e2e `docs/tree.spec.ts` + vitest unit (fractional positions).
- **Severity:** blocker

### AT-052 — Issue & page templates
- **Preconditions:** templates section available.
- **Steps:** 1. Create issue template "Bug report" (description markdown, priority High, label bug, one sub-issue). 2. `Alt+C` → pick it → issue created prefilled incl. sub-issue. 3. Create page template "Meeting notes" (heading + attendees + action-items todo blocks). 4. New page → **Templates** → instantiate.
- **Expected:** issue template presets properties + nested sub-issue; page template clones its block tree; both templates reusable and editable; usage_count increments.
- **Automated:** playwright e2e `docs/templates.spec.ts` + vitest integration (instantiation).
- **Severity:** blocker

### AT-053 — Slash menu & markdown shortcuts
- **Preconditions:** empty page.
- **Steps:** 1. Type `/` → slash menu; filter "callout"; insert. 2. Type `# ` → heading 1; `## ` → heading 2; `- ` → bullet; `1. ` → numbered; `[] ` → todo; `> ` → quote; ` ``` ` + language → code block.
- **Expected:** every markdown shortcut converts the block on space/enter; slash menu searchable with keyboard nav; code block accepts language tag and renders monospace.
- **Automated:** playwright e2e `docs/shortcuts.spec.ts`.
- **Severity:** blocker

### AT-054 — Block drag, indent, move
- **Preconditions:** page with 6 mixed blocks.
- **Steps:** 1. Drag block 4 by handle (⋮⋮) between blocks 1 and 2. 2. Select blocks 2-3; drag as group after block 5. 3. `Shift+↑/↓` on a block to move it. 4. Drag block A into block B (list item) → becomes child.
- **Expected:** single + multi-block drags reorder with no lost blocks (positions unique); keyboard move works; nesting via drag creates child; order persists after reload.
- **Automated:** playwright e2e `docs/blockops.spec.ts` + vitest integration (batch endpoint atomicity).
- **Severity:** blocker

### AT-055 — Turn into, duplicate, delete, block link
- **Preconditions:** page with paragraph, bullet, quote, code blocks.
- **Steps:** 1. Handle menu (⋮⋮) → **Turn into** → quote → heading 2. 2. **Duplicate** a block with children. 3. **Delete** a block → toast Undo. 4. **Copy link** on a block; paste in another page.
- **Expected:** turn-into preserves text + compatible props; duplicate deep-copies children; delete+undo restores exact position; block link scrolls to and highlights the block.
- **Automated:** playwright e2e `docs/turninto.spec.ts`.
- **Severity:** blocker

### AT-056 — Inline formatting, mentions & embedded issue views
- **Preconditions:** page; saved view "High-pri bugs" exists.
- **Steps:** 1. Select text → **B** / *I* / `code` / link. 2. Type `@mem` → mention picker → @member mention. 3. Type `PRO-5` → issue mention chip. 4. `/issue view` → embed "High-pri bugs" as block. 5. Change one embedded issue's status from inside the embed; edit the saved view's filter.
- **Expected:** formatting renders; mentions notify (AT-065) and resolve to chips; embedded view is live (edit propagates ≤2 s) and interactive (inline status change works); filter edit to the saved view updates every embed.
- **Automated:** playwright e2e `docs/embeds.spec.ts` + vitest integration.
- **Severity:** blocker

### AT-057 — Page history & restore
- **Preconditions:** page with content; make edits over ≥15 minutes (dev clock).
- **Steps:** 1. Open **⋯ → Page history**. 2. Browse version list (timestamps + authors). 3. Preview an older version; **Restore**.
- **Expected:** snapshots exist per save-window; restore creates a new version (not data loss); current content recoverable from history after restore.
- **Automated:** vitest integration + manual-browser.
- **Severity:** major

### AT-058 — Doc comments & threads
- **Preconditions:** page with a paragraph; `member` and `admin` sessions.
- **Steps:** 1. Select text → **Comment** (`Cmd/Ctrl+Shift+M`). 2. Reply in thread; **Resolve** ✔. 3. Reopen from filter "Resolved". 4. Check member's inbox.
- **Expected:** inline comment anchors to the selection; threads resolve/reopen; comments pane filters by open/resolved/author; comment lands in mentioned user's inbox.
- **Automated:** playwright e2e `docs/comments.spec.ts`.
- **Severity:** major

### AT-059 — Favorites, recents, backlinks
- **Preconditions:** ≥3 pages; one page mentions another via `@page`.
- **Steps:** 1. Star two pages. 2. Visit several pages; check Recents ordering. 3. Open the mentioned page's backlinks panel.
- **Expected:** sidebar Favorites lists starred pages; Recents updates on visit (most-recent first); backlinks panel on the mentioned page shows the linking page with context snippet.
- **Automated:** playwright e2e `docs/nav.spec.ts`.
- **Severity:** major

### AT-060 — Page trash & restore
- **Preconditions:** parent page "Wiki" with child "Onboarding".
- **Steps:** 1. Delete "Wiki" → trash. 2. Open **Trash**; search "Wiki"; restore. 3. Attempt editing a page while in trash. 4. (Dev clock +31 days) verify purge.
- **Expected:** deleting parent trashes children; restore recovers the full subtree; in-trash pages are read-only; purge after 30 days permanent (search no longer finds them).
- **Automated:** vitest integration (cascade + purge) + playwright e2e.
- **Severity:** blocker

## Group 11 — Search (AT-061 … AT-063)

### AT-061 — Unified global search
- **Preconditions:** issue with the word "zephyr" in DESCRIPTION; page with "zephyr" in body; comment containing "zephyr".
- **Steps:** 1. Press `/`; type `zephyr`. 2. Inspect result groups (Issues / Pages / Comments). 3. Type `"zephyr release"` (quoted).
- **Expected:** all three entity types found from ONE index (title + body + comments); grouped results with type icons; quoted phrase = exact match; results open the entity (comment result opens its thread).
- **Automated:** playwright e2e `search/global.spec.ts` + vitest integration (FTS5 content policy).
- **Severity:** blocker

### AT-062 — Ranking, filters, recents, permissions
- **Preconditions:** many matches for "zephyr"; guest session available; one matching page in workspace Sidegig (not user's).
- **Steps:** 1. Search "zephyr"; verify recently-edited rank higher. 2. Filter results by type Pages. 3. As guest, repeat the search. 4. Check recents after visiting results.
- **Expected:** ranking = bm25 + recency + title boost (documented order); type filter works; guest sees only team-scoped issue results (no pages); cross-workspace content NEVER appears; recents list recent results.
- **Automated:** vitest integration (ranking + scoping) + playwright e2e.
- **Severity:** blocker

### AT-063 — Quick-open & in-view filter
- **Preconditions:** issues list open; inbox has items.
- **Steps:** 1. `O I` → type issue title fragment → `Return`. 2. On issues view press `Cmd/Ctrl+F` → type fragment. 3. In Inbox press `Cmd/Ctrl+F` → type an ID.
- **Expected:** quick-open jumps to the issue; in-view filter narrows the CURRENT view client-side without changing saved filters; inbox filter matches title/ID/assignee.
- **Automated:** playwright e2e `search/quickopen.spec.ts`.
- **Severity:** major

## Group 12 — Notifications & Activity (AT-064 … AT-068)

### AT-064 — Auto-subscribe & assignment notification
- **Preconditions:** `member` (Session B) idle on Inbox.
- **Steps:** 1. (Session A) Create an issue assigned to member. 2. As member change a property on it. 3. (Session A) Add a comment.
- **Expected:** member receives "assigned" notification instantly (SSE); creator auto-subscribed on create; subsequent comment generates one notification with correct actor/verb/entity; clicking the notification opens the issue.
- **Automated:** playwright e2e `inbox/notifications.spec.ts` + vitest integration (subscription rules).
- **Severity:** blocker

### AT-065 — Mention & no-access warning
- **Preconditions:** `member` mentions `@guest` in an issue comment (guest lacks that team); `member` mentions `@admin` in a doc.
- **Steps:** 1. Post the issue comment mentioning guest. 2. Post doc comment mentioning admin. 3. Check admin inbox.
- **Expected:** author sees warning "guest doesn't have access to this issue — they won't be notified" (explicit, not silent); admin receives doc-comment mention notification; issue mention by a user with access notifies normally.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** blocker

### AT-066 — Inbox operations, snooze, uncapped
- **Preconditions:** member with 25 notifications.
- **Steps:** 1. `G I`; `J/K` navigate; `U` toggle read; `Alt+U` mark all read. 2. `H` snooze one for 1 hour. 3. `Backspace` delete one; `Shift+Backspace` delete all read. 4. Generate 2,100 notifications via seed script; load inbox.
- **Expected:** keyboard ops work; snoozed item hides then returns; deleted items removed (not "dropped silently"); 2,100+ notifications all present (no 2,000 cap) with fast virtualized list; unread badge counts stay accurate.
- **Automated:** playwright e2e `inbox/ops.spec.ts` + vitest integration (no cap).
- **Severity:** blocker

### AT-067 — Per-type notification preferences
- **Preconditions:** member in **Settings → Notifications**.
- **Steps:** 1. Disable "Status changed" and "Assignment". 2. Trigger both event types for the member (Session A).
- **Expected:** disabled types generate no inbox items; other types (mentions, comments) still arrive; prefs persist across sessions.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** major

### AT-068 — Workspace activity log
- **Preconditions:** mixed recent activity incl. a cycle rollover (AT-040) and an AI triage suggestion (AT-076).
- **Steps:** 1. Open **Activity** (sidebar). 2. Filter by actor kind System, then AI, then by member. 3. Click an issue entry.
- **Expected:** single ledger shows user / system (rollover, auto-archive) / AI (suggested label, engine-labeled) entries with accurate verbs; filters work; entity click navigates.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** blocker

## Group 13 — Insights (AT-069 … AT-072)

### AT-069 — Velocity & time metrics
- **Preconditions:** team with ≥3 completed cycles containing completed issues (seed data).
- **Steps:** 1. Open **Insights → Velocity**. 2. Switch metric count ↔ points (estimates on). 3. Open **Cycle time** scatter; hover the p50 marker; click an outlier dot.
- **Expected:** velocity bars per cycle match computed data; points mode uses estimate weights (unestimated = 1); scatter shows p25/50/75/95 markers; clicking a dot opens that issue; lead time and triage time selectable.
- **Automated:** vitest integration (metric math) + playwright e2e `insights/velocity.spec.ts`.
- **Severity:** blocker

### AT-070 — Burn-up & created-vs-completed
- **Preconditions:** 8 weeks of seeded issue history.
- **Steps:** 1. Open **Burn-up**; toggle weekly ↔ monthly; toggle include-archived. 2. Open **Created vs Completed**; hover the backlog trend line.
- **Expected:** burn-up shows cumulative scope vs completed over time (matches query of created_at/completed_at); granularity and archive toggles change data correctly; created-vs-completed bars + net-trend line consistent.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** blocker

### AT-071 — Breakdowns & segmentation
- **Preconditions:** issues with labels/priorities/assignees.
- **Steps:** 1. On velocity chart, **Segment by Label**. 2. Segment by Assignee. 3. Hover a bar segment → breakdown tooltip.
- **Expected:** segmentation splits bars by the dimension; tooltip lists counts per segment; dimension switcher includes label/assignee/priority/state/project/milestone.
- **Automated:** playwright e2e `insights/breakdown.spec.ts`.
- **Severity:** blocker

### AT-072 — Click-through & CSV export
- **Preconditions:** any chart with data.
- **Steps:** 1. Click a bar/segment → issues list opens with the equivalent filter pre-applied. 2. Click **Export CSV** on the chart.
- **Expected:** click-through filter exactly matches the chart slice (compare counts); CSV downloads with headers + rows matching the chart data.
- **Automated:** playwright e2e + vitest integration (filter equivalence).
- **Severity:** blocker

## Group 14 — AI Features — deterministic, fixture-driven (AT-073 … AT-084)

*All AI tests run with NO provider configured (engine = `local-deterministic`). Determinism is asserted: same fixture → same output.*

### AT-073 — NL → filter (FM-062)
- **Preconditions:** seeded vocabulary: team Core, label bug, user "member", priorities.
- **Fixture input:** `"high priority bugs assigned to me updated last week"`.
- **Steps:** 1. In the filter bar click the **✦ NL** chip; type the fixture; submit.
- **Expected:** parsed filter rendered as chips BEFORE applying: `Priority is High`, `Labels includes bug`, `Assignee is me`, `Updated within last 7 days` ("high" maps to exactly High; "high or urgent" would yield is-either-of); user can edit/remove each chip; applying yields the correct issue set; an unparseable phrase yields "Couldn't parse — try wording like: …" instead of a wrong filter.
- **Automated:** vitest unit (grammar → AST, table of 12 fixtures incl. ambiguous + garbage) + playwright e2e.
- **Severity:** blocker

### AT-074 — Duplicate detection on create (FM-063)
- **Preconditions:** existing open issue `PRO-77` titled "App crashes when exporting CSV" with a stack trace in description.
- **Fixture input:** new issue title "Crash on CSV export" + same stack trace.
- **Steps:** 1. `C` → type fixture title + description → pause 300 ms.
- **Expected:** banner "Similar to PRO-77 (≥75% overlap)" appears pre-create with side-by-side diff and shared terms highlighted; exact stack-trash hash match flagged "identical stack trace"; buttons **Create anyway** / **Open PRO-77**; NO auto-merge or auto-block; ai_run logged (feature dedup, engine local).
- **Automated:** vitest unit (MinHash fixtures: near-dupe ≥0.75, distinct <0.3, reordered text, unicode) + playwright e2e.
- **Severity:** blocker

### AT-075 — Triage suggestions with "why" (FM-064)
- **Preconditions:** seeded team history: ≥10 past issues labeled `bug`/`feature` with assignees; triage enabled.
- **Fixture input:** triage issue "Payment webhook returns 500 with TypeError: undefined stack trace attached".
- **Steps:** 1. Open the issue in triage; wait for suggestion chips. 2. Click the **why** popover on the label suggestion.
- **Expected:** chips suggest label `bug` + priority `High` + assignee (from kNN history); why-popover lists the matched rule ("contains 'TypeError'", "stack trace present") and the similar past issues with scores; nothing is applied until accepted.
- **Automated:** vitest unit (rule engine + kNN fixtures) + playwright e2e.
- **Severity:** blocker

### AT-076 — Triage accept/reject + graceful fallback (FM-064)
- **Preconditions:** issue with suggestions from AT-075 open; a fresh issue form available.
- **Steps:** 1. Click **Accept** on label suggestion → label applied (activity: "AI suggested label bug — accepted by member"). 2. Click **Reject** on priority suggestion. 3. Submit a 50,000-char garbage issue description with zero-width chars.
- **Expected:** accept applies suggestion + logs AI activity entry with engine label; reject records feedback (triage_feedback row); garbage input returns NO suggestion (never crashes, never blocks the inbox) and the issue remains fully usable.
- **Automated:** vitest unit (fallback + caps) + vitest integration + playwright e2e.
- **Severity:** blocker

### AT-077 — Summarization with sources (FM-065)
- **Preconditions:** seeded "zephyr launch thread" fixture issue exists.
- **Fixture input:** issue thread with 12 comments (seeded "zephyr launch thread" fixture).
- **Steps:** 1. Open the issue; click **Summarize thread**. 2. Click any sentence in the summary.
- **Expected:** summary = 3-5 sentences, EVERY sentence verbatim from a comment and clickable → scrolls to + highlights that comment; "Generated by Local engine · as of <ts>" tag; deterministic across runs.
- **Automated:** vitest unit (TextRank fixtures, source-ref integrity) + playwright e2e.
- **Severity:** blocker

### AT-078 — Ask workspace with citations (FM-066)
- **Fixture input:** question `"Where does the CSV export crash?"` (answer exists in PRO-77's description).
- **Steps:** 1. Open **Ask Prodmax** (palette → "ask"); type the question.
- **Expected:** answer composed of extracted sentences from PRO-77 with citation links; confidence (retrieval score) shown; engine label "Local engine"; sub-second response; ai_run logged.
- **Automated:** vitest integration (retrieval fixtures) + playwright e2e.
- **Severity:** blocker

### AT-079 — Ask with no confident match (FM-066)
- **Preconditions:** workspace contains no swallow-related content.
- **Fixture input:** `"What is the airspeed velocity of an unladen swallow?"`.
- **Steps:** 1. Ask the fixture question.
- **Expected:** explicit "No confident match in this workspace" result with the closest 3 low-score hits listed as links — NOT a fabricated answer; no fallback to invented text.
- **Automated:** vitest integration (threshold) + playwright e2e.
- **Severity:** blocker

### AT-080 — Drafting from related issues (FM-067)
- **Preconditions:** project "Website revamp" with related labeled issues + discussion.
- **Steps:** 1. On the project, **⋯ → Draft brief (AI)**. 2. Inspect the proposal. 3. Attempt a draft mentioning a nonexistent user `@ghost`.
- **Expected:** PRD-style draft appears as a PROPOSAL (side-by-side, editable, not saved) with sections filled from structured fields + TextRank extracts and "as of" stamp; existing docs are never mutated; `@ghost` renders as plain unlinked text (entity validation), never creates a user.
- **Automated:** vitest unit (template fill + entity validation fixtures) + playwright e2e.
- **Severity:** blocker

### AT-081 — Related content panel (FM-068)
- **Preconditions:** fixture issues exist (see fixture input).
- **Fixture input:** two issues sharing distinctive terms "zephyr export race condition" + an unrelated issue.
- **Steps:** 1. Open the shared-term issue; expand **Related** panel.
- **Expected:** the sibling issue listed with shared-term highlights and similarity score; unrelated issue absent (threshold); panel passive (no notifications); workspace opt-out in settings removes the panel.
- **Automated:** vitest unit (TF-IDF fixtures) + playwright e2e.
- **Severity:** major

### AT-082 — Backlog hygiene digest & clustering (FM-069, FM-071)
- **Fixture input:** seed issues: 3 stale (>60 d untouched, unassigned), 2 near-duplicates, 1 healthy.
- **Steps:** 1. Run **AI → Backlog hygiene** on team Core. 2. Inspect the digest items. 3. Select 2 items → **Apply** → then **Undo**. 4. Open cluster cards.
- **Expected:** digest lists exactly the stale + duplicate-cluster items with reasons; apply performs only checked items with an undo token (undo restores all); clusters group near-dupes with cohesion score + shared terms; nothing auto-archived; weekly run cap respected (second run same week is a no-op).
- **Automated:** vitest integration (heuristics + apply/undo + caps) + playwright e2e.
- **Severity:** major

### AT-083 — Meeting-notes extraction & Deep Ask chat (FM-070, FM-073)
- **Preconditions:** members Priya and Omar exist; "Dana" is NOT a member; no AI provider configured.
- **Fixture input:** notes: `"Priya will fix the export bug by Friday. Omar owns the docs rewrite. Something about the q3 launch."` (Priya/Omar are members; "Dana will…" is NOT a member.)
- **Steps:** 1. **AI → Extract action items**; paste fixture; submit. 2. Inspect the review tray. 3. Approve one item ("Create all" NOT used). 4. Open chat (palette → "chat"); ask `"summarize open bugs"`.
- **Expected:** action items parsed with assignee Priya/Omar + due Friday; Dana item shows assignee as unlinked text (unknown entity never auto-created); only the approved item becomes an issue (correct fields); chat answers with engine label "Local engine" (no provider configured) and cites sources; per-message token/latency counter visible.
- **Automated:** vitest unit (extraction fixtures + entity validation) + playwright e2e.
- **Severity:** major

### AT-084 — ai_runs ledger, engine labels & usage page (FM-084)
- **Preconditions:** AT-073…AT-083 executed in this workspace.
- **Steps:** 1. Open **Settings → AI**. 2. Inspect usage stats + the runs ledger.
- **Expected:** every invocation recorded (feature, engine `local-deterministic`, duration, input hash, outcome); usage page shows per-feature invocation counts, median latency, accept-rate where applicable, cost column `$0.00`; engine label visible on every AI artifact in the product; provider list shows "No provider configured (local engine active)".
- **Automated:** vitest integration (ledger completeness) + playwright e2e.
- **Severity:** blocker

## Group 15 — Realtime & Presence (AT-085 … AT-089)

### AT-085 — Two-session live sync
- **Preconditions:** Session A and B as two members viewing All Issues.
- **Steps:** 1. A changes an issue's state. 2. B (without interaction) observes the row move columns/groups.
- **Expected:** propagation ≤ 2 s (target ~1 s); no reload needed; event payload carries only the delta (verify network tab: single `issue.updated`).
- **Automated:** playwright e2e `realtime/sync.spec.ts` (two contexts).
- **Severity:** blocker

### AT-086 — Optimistic UI round-trip
- **Preconditions:** Session A on All Issues; devtools network tab open.
- **Steps:** 1. A assigns an issue; measure time to UI update. 2. Network tab: confirm mutation request completes afterwards.
- **Expected:** UI updates instantly (< 100 ms, before network completes); reconciliation keeps the value (no flicker); failed mutation rolls back with an error toast.
- **Automated:** playwright e2e + manual-browser.
- **Severity:** blocker

### AT-087 — Reconnect & Last-Event-ID replay
- **Preconditions:** Session B connected; `id:` values visible in the events stream.
- **Steps:** 1. Kill the network for Session B for 10 s (devtools offline). 2. During offline, A makes 3 edits. 3. Restore network.
- **Expected:** EventSource auto-reconnects with `Last-Event-ID`; the 3 missed events replay in order; B's UI converges without reload; if replay window exceeded → `resync` event triggers full refetch.
- **Automated:** playwright e2e `realtime/reconnect.spec.ts` + vitest integration (event_log replay).
- **Severity:** blocker

### AT-088 — Concurrent same-field edit conflict
- **Preconditions:** A and B viewing the same issue.
- **Steps:** 1. A sets priority High; within the same second B sets priority Low (both optimistically). 2. Observe both sessions.
- **Expected:** later write wins server-side; the other session shows a non-destructive conflict notice ("Priority was changed by B to Low — keep yours / accept") instead of silently clobbering; version numbers in events are monotonic; no data loss on unrelated fields.
- **Automated:** vitest integration (version conflict → 409) + playwright e2e.
- **Severity:** blocker

### AT-089 — Presence indicators
- **Preconditions:** A and B on the same issue.
- **Steps:** 1. Check avatar stack on the issue header. 2. B navigates to a different issue. 3. B closes the tab.
- **Expected:** both avatars with viewing state; movement updates ≤ 5 s; disconnect removes B's avatar ≤ 15 s (no ghosts); presence never blocks any interaction.
- **Automated:** playwright e2e `realtime/presence.spec.ts`.
- **Severity:** major

## Group 16 — API Keys, Webhooks & CSV (AT-090 … AT-094)

### AT-090 — API key lifecycle
- **Preconditions:** admin signed in.
- **Steps:** 1. **Settings → API keys → Create** (name "CI", scopes read+write). 2. Copy the shown `pmx_…` secret (shown once). 3. `GET /api/auth/session` equivalent with `Authorization: Bearer`. 4. Revoke the key; repeat the call.
- **Expected:** secret displayed exactly once; only its prefix stored (`pmx_abc1…`); authenticated calls act as the creating user (workspace + role enforced); revoked key → 401; last_used_at updates.
- **Automated:** vitest integration + playwright e2e `api/keys.spec.ts`.
- **Severity:** blocker

### AT-091 — REST CRUD, pagination & error shape
- **Preconditions:** valid API key.
- **Steps:** 1. `GET /api/issues?wsId=…&limit=2` → follow `nextCursor` until exhausted. 2. `POST /api/issues` with invalid body `{title: ""}`. 3. `PATCH /api/issues/:id` with `expectedVersion` stale. 4. `GET /api/nonexistent`.
- **Expected:** cursor pagination stable & complete (no dupes/gaps); validation error returns `{"error":{"code":"VALIDATION","message":…,"details":[…]}}` 400; stale version → 409 CONFLICT; unknown route → 404 with the same error envelope.
- **Automated:** vitest integration (http-layer tests).
- **Severity:** blocker

### AT-092 — CSV import dry-run/commit & CSV export
- **Preconditions:** admin; CSV file with 20 rows (columns Title, Description, Status, Assignee, Labels, Priority) incl. 2 rows with unknown assignee; a filtered view exists.
- **Steps:** 1. **Settings → Import/Export → Import CSV**; upload; map columns; **Dry run**. 2. Review warnings (unknown assignees). 3. **Commit**. 4. Export the filtered view as CSV; re-import it.
- **Expected:** dry-run reports 20 rows + 2 warnings, writes nothing; commit creates 20 issues (unknown assignees → unassigned, reported); export CSV matches view rows and round-trips as import template; import batch deletable from the import log; member role blocked from import UI and API.
- **Automated:** vitest integration (import pipeline) + playwright e2e `api/csv.spec.ts`.
- **Severity:** blocker

### AT-093 — Webhook delivery & HMAC signature
- **Preconditions:** admin; webhook receiver at `https://webhook.site/<id>` subscribed to `issue.*`.
- **Steps:** 1. **Settings → Webhooks → Add** (URL, events issue.created/updated). 2. Create an issue. 3. Inspect the received request headers/payload at the receiver.
- **Expected:** delivery within 5 s; `X-Prodmax-Signature: sha256=<HMAC-SHA256(secret, body)>` verifies (recompute manually); payload includes event name, workspace id, entity, actor; deliveries page shows 200 entry.
- **Automated:** vitest integration (HMAC correctness against test receiver) + manual-browser.
- **Severity:** blocker

### AT-094 — Webhook retry, dead-letter, redeliver
- **Preconditions:** webhook pointed at a URL returning 500.
- **Steps:** 1. Trigger an event. 2. Advance dev clock through the retry schedule (1m/5m/30m/2h/6h). 3. Inspect the deliveries ledger; press **Redeliver** after fixing the receiver.
- **Expected:** 5 attempts with exponential backoff, then status `failed` (dead-letter) with error text; no further retries; manual redelivery succeeds and logs a new delivery row; `*` wildcard subscription receives all events.
- **Automated:** vitest integration (retry queue).
- **Severity:** major

## Group 17 — Permissions & Isolation (AT-095 … AT-099)

### AT-095 — Workspace switcher isolation
- **Preconditions:** `owner@prodmax.test` owns both workspaces.
- **Steps:** 1. In Prodmax HQ note issue `PRO-1`. 2. Switch to Sidegig. 3. Search "PRO-1"; visit `/issue/PRO-1` directly.
- **Expected:** PRO-1 absent from search, lists, and direct URL (404) while in Sidegig; switching back restores it; no cross-workspace leakage of notifications, activity, or presence.
- **Automated:** vitest integration + playwright e2e `isolation/switch.spec.ts`.
- **Severity:** blocker

### AT-096 — Cross-workspace API denial
- **Preconditions:** API key created in Prodmax HQ; Sidegig issue id `iss_sidegig_1` known.
- **Steps:** 1. `GET /api/issues/iss_sidegig_1` with the Prodmax key. 2. `PATCH` it. 3. `GET /api/events?wsId=<sidegig>` with the Prodmax key/session.
- **Expected:** 404 (not 403 — no existence leak) for read; 404 for write; SSE for foreign workspace refused; sidegig data unchanged.
- **Automated:** vitest integration.
- **Severity:** blocker

### AT-097 — Guest cross-team denial
- **Preconditions:** guest of team Core; Design issue `DES-1` id known.
- **Steps:** 1. `GET /api/issues/DES-1` as guest (session + API key created for guest). 2. Guest opens a board grouped by team.
- **Expected:** 404 for DES-1 via both auth paths; board shows only Core groups; guest cannot create API keys (403) — attempt verified.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** blocker

### AT-098 — Guest Docs/admin denial
- **Steps:** 1. As guest: `GET /api/pages`, `POST /api/pages`, `GET /api/workspaces/:id/members`, `POST /api/webhooks`.
- **Expected:** pages endpoints 403 (guests lack Docs); member-list minimal roster only; webhook create 403; UI hides these surfaces (AT-012 verified visually).
- **Automated:** vitest integration.
- **Severity:** blocker

### AT-099 — Role enforcement sweep & AI inheritance
- **Steps:** 1. As member: attempt `PATCH /api/teams/:id`, `POST /api/keys`, `POST /api/webhooks`, `POST /api/import/csv` → expect 403 each. 2. As member: `POST /api/ai/ask` about a Design-team issue id → expect scoped/empty result. 3. As admin: all four succeed.
- **Expected:** service-layer matrix enforced identically across UI, API, and AI paths; AI retrieval never returns entities the caller cannot read (ask about DES-1 as member-of-nothing returns no leak).
- **Automated:** vitest integration (matrix table test).
- **Severity:** blocker

## Group 18 — Security (AT-100 … AT-105)

### AT-100 — CSRF enforcement
- **Preconditions:** valid session cookie.
- **Steps:** 1. From an external origin (or curl without `X-CSRF-Token`), `POST /api/issues` with the cookie. 2. Repeat with the token header. 3. `GET` without token.
- **Expected:** state-changing request without token → 403 `FORBIDDEN` (CSRF); with token → 201; GETs unaffected; token rotates on login.
- **Automated:** vitest integration + playwright e2e `security/csrf.spec.ts`.
- **Severity:** blocker

### AT-101 — XSS via block content
- **Fixture inputs:** paragraph text `<img src=x onerror=alert(1)>`; code block containing `<script>`; bookmark URL `javascript:alert(1)`; image block `onerror` payload; markdown link `[x](javascript:alert(1))`.
- **Steps:** 1. Insert each fixture into a page; reload; view as another user.
- **Expected:** everything renders as literal text or is rejected (javascript: URLs blocked at save with validation error); no script execution in either session (console clean); stored content sanitized server-side.
- **Automated:** playwright e2e `security/xss-blocks.spec.ts` + vitest unit (sanitizer).
- **Severity:** blocker

### AT-102 — XSS via issue fields & search reflection
- **Fixture inputs:** issue title `<svg onload=alert(1)>`; comment with markdown `[click](javascript:...)`; search query `""><script>"`.
- **Steps:** 1. Create/save fixtures; view list, issue detail, search results, insights tooltips.
- **Expected:** title renders escaped everywhere (list, board card, chart tooltip, notification, activity log); malicious link schemes stripped; search query echoed as text.
- **Automated:** playwright e2e + vitest unit (markdown renderer allowlist).
- **Severity:** blocker

### AT-103 — SQL injection
- **Fixture inputs:** filter value `'; DROP TABLE issues; --`; search `%" OR 1=1 --`; NL→AI text with the same; sort param `state;--`; cursor tampering.
- **Steps:** 1. Submit each via UI and API.
- **Expected:** all inputs treated as literals (parameterized queries); zero schema changes; errors (if any) are VALIDATION 400 with the standard envelope; FTS query syntax escaped (`"` doubling).
- **Automated:** vitest integration (injection corpus).
- **Severity:** blocker

### AT-104 — Cookie flags & session hygiene
- **Steps:** 1. Inspect cookies in devtools. 2. Log in; check the session token changed vs pre-login. 3. Attempt `/api/events` from another origin via fetch.
- **Expected:** session cookie `HttpOnly; Secure; SameSite=Lax; Path=/`; no session token reachable via `document.cookie`; new session id after login (no fixation); cross-origin SSE blocked by auth model.
- **Automated:** playwright e2e `security/cookies.spec.ts` + manual-browser.
- **Severity:** blocker

### AT-105 — API key scopes & rate limit
- **Preconditions:** two keys: read-only and read+write.
- **Steps:** 1. `POST /api/issues` with the read-only key → 403. 2. Fire 1,050 requests/hour with the write key (script). 3. Inspect rate-limit headers.
- **Expected:** scope enforcement exact; request 1,001 → 429 with `Retry-After: 60` and `X-RateLimit-*` headers; limit is per-key (other key unaffected); no error-shape deviation.
- **Automated:** vitest integration (limiter) + manual-browser (burst script).
- **Severity:** blocker

## Group 19 — Accessibility (AT-106 … AT-109)

### AT-106 — Keyboard-only full journey
- **Steps:** Using ONLY the keyboard: register → onboard → create issue → set properties → create cycle → create page with 5 block types → search → read inbox → open insights → run an AI summarize → change theme.
- **Expected:** every step completable without pointer; no keyboard traps; visible focus at all times; skip-to-content link works.
- **Automated:** playwright e2e `a11y/keyboard.spec.ts` + manual-browser.
- **Severity:** blocker

### AT-107 — Labels, roles & live regions
- **Steps:** 1. Run axe on: issues list, issue detail, doc editor, inbox, insights, settings (light + dark). 2. Check toast announcements; check optimistic-update announcements; check board column labels.
- **Expected:** zero axe critical/serious violations per surface; toasts and sync updates announced via `aria-live="polite"`; all inputs have labels; board uses listbox/option semantics with group labels.
- **Automated:** playwright e2e with `@axe-core/playwright`.
- **Severity:** blocker

### AT-108 — Contrast & readable theming
- **Steps:** 1. Toggle light/dark on every major surface; run contrast checks on text, chips, chart labels, presence avatars.
- **Expected:** text ≥ 4.5:1 (large text ≥ 3:1) in both themes including dithered chart annotations; focus indicator ≥ 3:1 against adjacent colors.
- **Automated:** manual-browser (contrast probe) + design-token vitest unit (token pairs table).
- **Severity:** major

### AT-109 — Focus management
- **Steps:** 1. Open quick-create modal → `Esc` → focus returns to trigger. 2. Open palette → type → `Esc`. 3. Route change via `G P`. 4. Delete-issue confirm dialog.
- **Expected:** modals trap focus while open and restore it on close; route changes move focus to the page header (announced); dialogs are labelled with initial focus on the safe action.
- **Automated:** playwright e2e `a11y/focus.spec.ts`.
- **Severity:** major

## Group 20 — Visual & Responsive (AT-110 … AT-112)

### AT-110 — Theming & signature visuals
- **Steps:** 1. Toggle dark → light → system (persists across reload, no flash). 2. Check dither avatars (each user distinct, deterministic from seed). 3. Check dither charts in insights; canvasui effect on onboarding + empty states; no canvas effect on working surfaces (editor/board).
- **Expected:** theme preference persisted server-side; deterministic avatars; charts render in theme-appropriate palettes; signature effects present exactly on brand moments and NEVER obscure or animate working content.
- **Automated:** playwright e2e `visual/theme.spec.ts` (screenshot diff light/dark) + manual-browser.
- **Severity:** major

### AT-111 — Responsive breakpoints & touch safety
- **Steps:** 1. 1440 / 1024 / 768 / 375 px viewports: sidebar, board, table, doc editor, palette. 2. On touch emulation, drag a board card to another column.
- **Expected:** layouts reflow without data loss (columns collapse, table scrolls horizontally with frozen ID); board drag on touch requires a confirm sheet ("Move to In Progress?") — no accidental mutation; palette usable at 375 px.
- **Automated:** playwright e2e `visual/responsive.spec.ts` (4 viewports) + manual-browser (touch).
- **Severity:** blocker

### AT-112 — Reduced motion & animation correctness
- **Steps:** 1. Enable OS `prefers-reduced-motion`; reload; navigate + run SSE updates. 2. Disable; verify animations are short (≤ 200 ms) and purposeful (toasts, modal in, optimistic flash).
- **Expected:** with reduced motion all non-essential animation disabled (canvas signature effects replaced by static dither); without it, animations smooth at 60 fps with no layout jank during rapid SSE updates.
- **Automated:** playwright e2e (emulated media) + manual-browser.
- **Severity:** minor

## Group 21 — Edge Cases (AT-113 … AT-119)

### AT-113 — Large volume: virtualization, big CSV, markdown export
- **Preconditions:** seed 10,000 issues; a 5,000-block page; 10k-row CSV.
- **Steps:** 1. Open All Issues; scroll fast through list & table; open board. 2. Import the 10k-row CSV (dry-run + commit). 3. Export the page to Markdown and re-import.
- **Expected:** list/table scroll at 60 fps (virtualized, no full render); board column counts correct; CSV handles 10k rows in one batch with progress + resumable report; page open < 1.5 s; markdown export round-trips headings/lists/code/tables losslessly (diff shows structural equivalence).
- **Automated:** vitest integration (import/export scale) + manual-browser (perf observation).
- **Severity:** major

### AT-114 — Unicode, CJK, RTL, emoji
- **Fixture inputs:** titles: `日本語のタイトル`, `العربية ملّية`, `emoji 🎉🚧 combo`, combining chars `e\u0301`, zero-width `\u200B`.
- **Steps:** 1. Create issues/pages with fixtures. 2. Search for `日本語` and `العربية`. 3. Run dedup on two near-identical CJK issues. 4. Check identifiers, chips, and FTS results.
- **Expected:** all content stored/rendered intact; CJK search matches (trigram fallback); dedup works language-agnostically (shingling); zero-width chars stripped from AI inputs (AT-076) but preserved in user content; no layout breakage in RTL strings.
- **Automated:** vitest integration (unicode corpus) + playwright e2e.
- **Severity:** major

### AT-115 — Long input & huge page
- **Fixture inputs:** 600-char title (cap 512); 100k-char description; 5,000-block page; 10k-char NL→AI query.
- **Expected:** title hard-capped with counter warning; description accepted and preview truncated with "show more"; 5k-block page opens via single query and stays editable (no timeout); oversized AI input rejected with a clear limit message (never a hang).
- **Automated:** vitest integration + manual-browser.
- **Severity:** major

### AT-116 — Empty states
- **Steps:** On a fresh workspace visit: All Issues, Board, Triage (off then on), Cycles (off then on), Projects, Docs, Inbox, Search (no results), Insights (no data), Favorites.
- **Expected:** every empty surface shows an explanatory empty state with the next action (button/create hint) + signature illustration; no console errors; no broken counters (0s, not NaN).
- **Automated:** playwright e2e `edge/empty.spec.ts`.
- **Severity:** major

### AT-117 — Concurrent identifier allocation stress
- **Steps:** 1. Fire 25 parallel `POST /api/issues` across two API keys + one session.
- **Expected:** 25 distinct sequential identifiers, zero collisions or gaps, UNIQUE constraint never trips; all issues visible in list (count +25).
- **Automated:** vitest integration (parallel transaction stress).
- **Severity:** blocker

### AT-118 — Timezone & rollover boundaries
- **Preconditions:** team timezone set to UTC+13 (Tokelau) vs workspace UTC.
- **Steps:** 1. Verify cycle starts 00:01 team-local (not UTC). 2. Create a due-date filter "before end of month" across the boundary. 3. Check insights week bucketing of an issue completed at 23:30 UTC vs team-local next day.
- **Expected:** all day-boundary logic uses the team timezone; due-date filters and insight buckets align with team-local days (documented expectation); no off-by-one at month/year edges.
- **Automated:** vitest unit (timezone corpus) + vitest integration.
- **Severity:** major

### AT-119 — Server restart & data integrity
- **Steps:** 1. With two sessions active and pending optimistic edits, restart the Node process. 2. Clients reconnect. 3. Compare a sample of entities before/after (ids, versions, history).
- **Expected:** WAL-mode SQLite loses nothing; clients reconnect via SSE replay or `resync`; optimistic edits that had NOT been acknowledged are marked failed with retry affordance (never silently dropped); event_log replay intact for pre-restart events within retention.
- **Automated:** vitest integration (WAL durability) + manual-browser (restart drill).
- **Severity:** blocker

## Group 22 — AI dock & local CLI agents (AT-120 … AT-126)

Amendment 2026-08-18 (FM-073 Must). Uses a **mocked CLI** fixture that speaks `stream-json` — never the real `claude`/`codex` binaries in CI.

### AT-120 — Dock open/close + persist
- **Preconditions:** logged in as `member@prodmax.test`; viewport ≥1024.
- **Steps:** 1. Click SB-13 AI (or press `Cmd+J`). 2. Drag AD-08 to ~480px. 3. Reload. 4. Press `Cmd+J` twice. 5. Open an issue panel (`Enter` on a row) with the dock still open.
- **Expected:** dock opens as a right grid column (content reflows); width 320–560 (default 400); open state + width persist across reload; second `Cmd+J` closes; issue panel overlays content and does **not** close the dock; `<768` would be a full-screen sheet (spot-check or dedicated viewport).
- **Automated:** playwright e2e `ai-dock.spec.ts`.
- **Severity:** blocker

### AT-121 — Claude Code round-trip with mocked CLI
- **Preconditions:** workspace `chatProvider=claude-code`; mock CLI on `cliPath` emits stream-json deltas then a final result; real CLI not required.
- **Steps:** 1. Open dock. 2. Send "list my open bugs". 3. Wait for `done`.
- **Expected:** `POST .../messages` is `text/event-stream` with `chat-delta` then `done`; assistant markdown appears incrementally; `ai_runs.engine` is `provider:claude-code:<model>`; M8 EventSource is **not** used for these events.
- **Automated:** vitest integration (mock binary) + playwright e2e.
- **Severity:** blocker

### AT-122 — Proposal → apply → undo
- **Preconditions:** AT-121 mock configured to return one proposal `{method:'POST', path:'/api/issues', body:{title:'Dock-created'}, label:'Create issue'}`.
- **Steps:** 1. Send a turn that yields the proposal. 2. Click **Apply** on AD-07. 3. Click **Undo** on the toast.
- **Expected:** Apply hits `POST /api/issues` under the user session (same auth as a human create); issue appears; no server-side replay of a stored raw request; Undo restores (issue gone / compensating action); proposal card shows applied/undone state.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** blocker

### AT-123 — Provider picker including not-installed
- **Preconditions:** Settings → AI (R-47); `codex` binary absent; `claude-code` mock present.
- **Steps:** 1. Open ST-90. 2. Select `codex`. 3. Select `claude-code`. 4. Select `local`.
- **Expected:** `codex` shows "Codex not installed" and does not crash; `claude-code` shows healthy; `local` always available; PATCH `/api/settings/ai` persists `chatProvider` / `model` / `cliPath`.
- **Automated:** playwright e2e + vitest integration (missing binary).
- **Severity:** major

### AT-124 — Degradation to local engine labeled
- **Preconditions:** `chatProvider=claude-code`; mock CLI exits non-zero / missing.
- **Steps:** 1. Send a dock message.
- **Expected:** turn completes on provider #0; engine badge reads `Local engine` with a short reason; no blank dock; `ai_runs.engine` is `local-deterministic`.
- **Automated:** vitest integration + playwright e2e.
- **Severity:** blocker

### AT-125 — Streaming deltas, Stop, resumable session
- **Preconditions:** mock CLI streams ≥5 `chat-delta` events over >500ms and accepts `--resume`.
- **Steps:** 1. Send a message. 2. Click AD-06 Stop mid-stream. 3. Send a follow-up in the same conversation.
- **Expected:** partial assistant text remains; Stop is hidden after abort; follow-up uses `cli_session_id` (`--resume`); conversation survives reload (GET `:id`).
- **Automated:** vitest integration (resume flag) + playwright e2e.
- **Severity:** blocker

### AT-126 — Context chip + ai_run input_hash
- **Preconditions:** issue `PRO-123` open (panel or page).
- **Steps:** 1. Open dock. 2. Confirm AD-04 reads `About: PRO-123`. 3. Send "summarize this". 4. Open the matching `ai_runs` row.
- **Expected:** context chip matches the current entity or view; `ai_runs.input_hash` is SHA-256 of the canonicalized payload that includes that context; clearing the chip unscopes the next turn (hash changes).
- **Automated:** vitest integration (hash) + playwright e2e.
- **Severity:** major

---

## Coverage Matrix — every Must feature (FM) → acceptance tests (AT)

Stretch-tier features (FM-072, FM-077) intentionally have no ATs. Should-tier features are covered where noted in the matrix below for completeness.

| FM | Feature | Tier | ATs |
|---|---|---|---|
| FM-001 | Registration & login | Must | AT-001, AT-002, AT-003 |
| FM-002 | Session & account security | Must | AT-004, AT-005, AT-104 |
| FM-003 | Request hardening | Must | AT-003, AT-100, AT-105 |
| FM-004 | Onboarding wizard | Must | AT-008, AT-009 |
| FM-005 | Multi-workspace & switcher | Must | AT-010, AT-095 |
| FM-006 | Roles incl. guest scoping | Must | AT-011, AT-012, AT-095, AT-096, AT-097 |
| FM-007 | Invitations | Must | AT-013 |
| FM-008 | Member administration | Must | AT-014, AT-015, AT-016 |
| FM-009 | Teams CRUD & settings | Must | AT-009, AT-011 |
| FM-010 | Workflow states | Must | AT-017, AT-024 |
| FM-011 | Labels | Must | AT-018, AT-025 |
| FM-012 | Issue CRUD & descriptions | Must | AT-019, AT-020, AT-021 |
| FM-013 | Identifiers & numbering | Must | AT-022, AT-023 |
| FM-014 | Priority, due dates & estimates | Must | AT-019, AT-020, AT-025 |
| FM-015 | Assignment & subscriptions | Must | AT-019, AT-064 |
| FM-016 | Relations | Must | AT-023 |
| FM-017 | Sub-issues | Must | AT-021 |
| FM-018 | Attachments | Should | AT-021 |
| FM-019 | Issue history & grace | Must | AT-024 |
| FM-020 | Trash & archive | Must | AT-026 |
| FM-021 | Filter bar | Must | AT-025, AT-027 |
| FM-022 | Advanced filters | Should | AT-027 |
| FM-023 | Grouping | Must | AT-028 |
| FM-024 | Ordering incl. manual | Must | AT-029 |
| FM-025 | Saved views & display | Must | AT-030, AT-031 |
| FM-026 | List/board/table layouts | Must | AT-028, AT-032, AT-113 |
| FM-027 | Bulk ops & undo | Must | AT-033, AT-034 |
| FM-028 | Keyboard shortcuts | Must | AT-035, AT-036 |
| FM-029 | In-row editing | Must | AT-036 |
| FM-030 | Cycle config & auto-create | Must | AT-038, AT-039 |
| FM-031 | Cycle scoping & rollover | Must | AT-039, AT-040 |
| FM-032 | Cycle surgery | Should | AT-041 |
| FM-033 | Velocity & snapshots | Should | AT-039, AT-069 |
| FM-034 | Projects | Must | AT-042, AT-043 |
| FM-035 | Project progress | Must | AT-043 |
| FM-036 | Project updates | Should | AT-044 |
| FM-037 | Milestones | Must | AT-045, AT-046 |
| FM-038 | Triage inbox & routing | Must | AT-047 |
| FM-039 | Triage actions | Must | AT-048 |
| FM-040 | Duplicate merge | Must | AT-049, AT-050 |
| FM-041 | Command palette | Must | AT-035, AT-037 |
| FM-042 | Unified global search | Must | AT-061, AT-062 |
| FM-043 | Quick-open & in-view filter | Should | AT-063 |
| FM-044 | Block editor (19 types) | Must | AT-051, AT-052, AT-053, AT-101 |
| FM-045 | Block operations | Must | AT-054, AT-055 |
| FM-046 | Embedded issue views | Must | AT-056 |
| FM-047 | Page history | Should | AT-057 |
| FM-048 | Doc comments | Should | AT-058 |
| FM-049 | Page tree | Must | AT-051, AT-059 |
| FM-050 | Page trash | Must | AT-060 |
| FM-051 | Favorites/recents/backlinks | Should | AT-059 |
| FM-052 | Issue templates | Must | AT-047, AT-052 |
| FM-053 | Page templates | Must | AT-052 |
| FM-054 | Recurring issues | Should | AT-040 |
| FM-055 | Notification inbox | Must | AT-064, AT-065, AT-066 |
| FM-056 | Per-type prefs | Should | AT-067 |
| FM-057 | Workspace activity log | Must | AT-068, AT-084 |
| FM-058 | Velocity & time metrics | Must | AT-069, AT-072 |
| FM-059 | Burn-up | Must | AT-070 |
| FM-060 | Created-vs-completed | Must | AT-070 |
| FM-061 | Breakdowns & export | Must | AT-071, AT-072 |
| FM-062 | AI: NL→filter | Must | AT-073 |
| FM-063 | AI: duplicate detection | Must | AT-074 |
| FM-064 | AI: triage assist | Must | AT-075, AT-076 |
| FM-065 | AI: summarization | Must | AT-077 |
| FM-066 | AI: ask workspace | Must | AT-078, AT-079 |
| FM-067 | AI: drafting | Must | AT-080 |
| FM-068 | AI: related content | Should | AT-081 |
| FM-069 | AI: backlog hygiene | Should | AT-082 |
| FM-070 | AI: meeting extraction | Should | AT-083 |
| FM-071 | AI: clustering | Should | AT-082 |
| FM-072 | AI: NL automation builder | Stretch | — |
| FM-073 | AI: dock + CLI agents | Must | AT-120, AT-121, AT-122, AT-123, AT-124, AT-125, AT-126 |
| FM-074 | API keys | Must | AT-090, AT-105 |
| FM-075 | REST API v1 | Must | AT-091, AT-092 |
| FM-076 | Webhooks | Must | AT-093, AT-094 |
| FM-077 | GitHub/Slack integrations | Stretch | — |
| FM-078 | CSV import/export | Must | AT-092, AT-113 |
| FM-079 | Markdown/HTML export | Should | AT-113 |
| FM-080 | Workspace isolation | Must | AT-095, AT-096, AT-097, AT-098 |
| FM-081 | Role enforcement everywhere | Must | AT-011, AT-012, AT-099 |
| FM-082 | Workspace settings | Must | AT-010, AT-015 |
| FM-083 | Team settings | Must | AT-017, AT-038, AT-047 |
| FM-084 | AI settings & transparency | Must | AT-084 |
| FM-085 | Dark/light/system theming | Must | AT-110 |
| FM-086 | Responsive & touch-safe | Must | AT-111, AT-112 |
| FM-087 | Signature brand visuals | Must | AT-110, AT-111 |
| FM-088 | SSE sync & replay | Must | AT-085, AT-086, AT-087, AT-088 |
| FM-089 | Presence | Must | AT-089 |
| FM-090 | Optimistic UI & conflicts | Must | AT-086, AT-088 |

**Matrix proof:** all 72 Must features have ≥1 AT; every group's tests map back to at least one Must (or documented Should) feature; AT-057/058/063/067/041/044/046/050/081/082/083 exercise Should-tier scope beyond the Must core.

## Test counts by group

| Group | Tests | IDs |
|---|---|---|
| Auth & Sessions | 7 | AT-001…007 |
| Onboarding | 2 | AT-008…009 |
| Workspaces, Members, Roles & Invites | 7 | AT-010…016 |
| Issues CRUD, Identifiers & History | 8 | AT-017…024 |
| Views, Filters, Layouts & Trash | 8 | AT-025…032 |
| Bulk Ops & Keyboard | 5 | AT-033…037 |
| Cycles | 4 | AT-038…041 |
| Projects & Milestones | 5 | AT-042…046 |
| Triage | 4 | AT-047…050 |
| Docs, Page Tree, Templates & Embedded Views | 10 | AT-051…060 |
| Search | 3 | AT-061…063 |
| Notifications & Activity | 5 | AT-064…068 |
| Insights | 4 | AT-069…072 |
| AI Features | 12 | AT-073…084 |
| Realtime & Presence | 5 | AT-085…089 |
| API Keys, Webhooks & CSV | 5 | AT-090…094 |
| Permissions & Isolation | 5 | AT-095…099 |
| Security | 6 | AT-100…105 |
| Accessibility | 4 | AT-106…109 |
| Visual & Responsive | 3 | AT-110…112 |
| Edge Cases | 7 | AT-113…119 |
| AI dock & local CLI agents | 7 | AT-120…126 |
| **Total** | **126** | |

**Severity distribution:** blocker 95 · major 30 · minor 1 (counted from individual tests above).
