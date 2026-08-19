# T-006 — M4b Projects/cycles UI

status: done
module: M4 projects & cycles
assignee: claude-opus-5 session 6858dcdc, 2026-08-19
owns: src/island/features/projects/**, src/island/features/cycles/**, edits to src/island/app/routes.ts (route swaps only), tests/island/features/{projects,cycles}*
depends-on: T-005, T-003

> Read `planning/tickets/README.md` first. Swaps: `/projects` (R-17),
> `/project/:id` (+/board /list R-19), `/cycle/current` (R-20),
> `/cycle/:id` (R-21).

## docs-to-read
- ux-spec.md §4.15 (S-15 project overview/list/board), §4.16 (S-16 cycles),
  §3.0 shared contract
- design-system.md chart/token specs for progress + charts

## Deliverables

- **S-15**: projects list (grouped by status, reorder); project overview —
  header (lead, target, health from latest update, progress bar from
  progress_cache), tabbed Issues (embeds the T-003 view engine scoped to
  the project), Milestones, Updates timeline (post update with health
  picker + progress snapshot); board/list reuse the view components with a
  project filter locked on.
- **S-16**: current cycle header (dates, progress, scope chart), issue
  scope add/remove (search picker), close-cycle flow with rollover
  preview; cycle list/History nav.
- Sidebar "Projects" + "Cycle N" links live (log any shell edits).

## Acceptance
RTL: overview renders cached progress (no issue scans on read), update
posting, cycle scope/close flows. All four gates green; e2e: create
project → add issue → complete it → progress bar moves.

## Work log

Session `6858dcdc`, 2026-08-19. Branch `feat/t-006-projects-cycles-ui`,
[PR 13](https://github.com/Jeff-Kazzee/Prodmax/pull/13). CI green, and the log
confirms the four gates really ran. It prints `PASS test counts unparsed`,
which is T-027 and not a failure.

### Gates

`node scripts/gates.mjs`, exit 0, run whole and pasted verbatim:

```
════ GATE VERDICT ════
PASS build  complete
PASS check  276 files, 0 errors
PASS test   files: 51 passed (51) | tests: 256 passed (256)
PASS e2e    9 passed (11.6s)
ALL GATES PASS
```

Baseline on `dev` was 244 files, 45 test files / 205 tests, 8 e2e.

### What shipped

R-17 projects list grouped by status. R-18 project overview with Overview,
Milestones and Updates on `?tab=`, and Issues as a route. R-19 gains the same
header by letting `ProjectScreen` own the board and list paths and mount
`IssueViewsScreen` itself, so `presetForPath` still locks `project eq :id` with
no edit to `features/issues`. R-20 and R-21 are one cycle screen with scoping,
a burn-up, cycle history and the close flow. Sidebar and rail carry Projects and
Current cycle.

### Deliverables not shipped, each with a ticket

No project reorder (T-028), no favorites star (T-029), no drag scoping or panel
chips (T-030), no sparkline, blocked count or real burn-up scope series
(T-031), no single-cycle GET so R-21 fans out (T-032). CY-06's other two
surgery items and CY-07 cooldown are not built and are named in T-030 and the
handoff. `patchCycle` is exported and unused for that reason.

### Constraint amendments

1. The route switch is `shellElement` in `src/island/app.tsx`. The ticket names
   `src/island/app/routes.ts`, which already registers R-17 to R-21 with
   breadcrumbs and needed no edit.
2. `src/island/components/shell/sidebar.tsx` and `sidebar-rail.tsx`. The
   ticket sanctions a shell edit if logged. Both listed `PRIMARY_NAV` only, so
   Projects and Current cycle reached the sidebar from nowhere.
3. `tests/e2e/projects.spec.ts` sits outside the `owns:` glob. Acceptance
   requires an e2e.

### Deviation

Cycles use `?cycleTeam=` rather than the `?team=` ux-spec §4.16 CY-01 names.
`IssueCreateHost` treats a bare `?team=` anywhere in the app as an intent to
create an issue, so the documented name pops the new-issue modal on every team
switch. That is a pre-existing defect, reachable today at `/triage?team=PRO`,
filed as T-033 with the revert instruction.

### Review

`/architect` ran four design sketches before any code. `/interrogate` ran four
reviewers against the frozen commit `dabc83b`, dispatched at
`git diff dev..dabc83b` with no edits held back into the tree while they read.

They found real defects, and the fixes are commits `c9a5311` and `b790224`. The
load-bearing ones: the burn-up summed scope over one page while the header used
the server's total, so the two disagreed on screen and a closed cycle could
render completed above scope; the close dialog used a page length as its
denominator; a failed milestones or updates read rendered as "no updates", which
made the header's health chip state a health claim invented from a 500; and
completing an issue did not move the progress bar, because the `onIssuesChanged`
bus never fires for state changes, contradicting a docblock that said it did.

Reviewer mutation testing also found two tests that could not fail. `dayXofY`'s
only case was one its own clamp made unfalsifiable, and the reorder guard
asserted no PATCH was sent in a test that clicked nothing.

### Falsification record

Every guard broken with the anchor asserted present first, and the specific
failure observed before restoring.

| Break | Failure |
|---|---|
| Derive percent from counts, not the cache | `expected aria-valuenow="62", received "39"` |
| Report zero counts on a legacy cache | `expected "14% · counts unavailable", received "14% · 0/0 issues"` |
| Fetch issues from the Overview tab | `expected [ '/api/issues?wsId=ws1&limit=50' ] to deeply equal []` |
| Drop the canceled exclusion from the rollover rule | `expected "3 of 6…", received "4 of 6…"` |
| Report the preview instead of the server's count | toast no longer contains `5 issues rolled over` |
| Count visible rows instead of the server's scope | `expected "9 issues · 21 pts", received "6 issues · 21 pts"` |
| Drop the client-side unscoped filter | `Add PRO-1 to cycle` present, expected null |
| Reintroduce the `dayXofY` off-by-one | `expected 1 to be 2` |
| Sum burn-up scope from rows | `expected +0 to be 12` |
| Use the page length as the close denominator | `expected "At least 3 of 9…", received "3 of 6…"` |
| Render a failed updates read as empty | `expected "Health unavailable", received "No update yet"` |
| Mark a finished project overdue | `expected not to have attribute data-overdue` |

Two tests were vacuous when written and were fixed, not excused. The backlog
fixture returned only unscoped issues, so deleting the client-side filter
changed nothing. The reorder guard is described above.

The cycles suite is now green across ten shuffled seeds. It previously passed
only in declaration order, which is how T-033 was found.

### Left unverified

The e2e writes one project and one issue into `data/prodmax.db` per run and
does not clean up. The suite is still not idempotent against an accumulated
database, which is carried forward from the previous handoff. Reviewer findings
about spec elements not built (CY-01 velocity toggle, CY-05 weekly granularity,
CY-07 cooldown, PJ-04 member count, PJ-01 colour picker) are recorded here and
in T-030 rather than fixed.
