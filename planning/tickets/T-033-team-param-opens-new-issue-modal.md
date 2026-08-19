# T-033 : `?team=` in the URL pops the new-issue modal on any screen

status: open
module: M3 issues
owns: src/island/features/issue-create/create-host.tsx, src/island/features/triage/triage-screen.tsx, src/island/features/cycles/**, tests/island/features/issue-create/**
depends-on: none

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-006, by chasing a test that failed only under a shuffled
run order. The test was right and the code was wrong.

## What happens

`src/island/features/issue-create/create-host.tsx:22-38` runs on every route.
It reads `title`, `priority` and `team` from the query string and, if any of
them is present, calls `openNewIssue(urlPrefill)`.

`IssueCreateHost` is mounted in the shell layout, so this applies to every
screen in the app. Any URL carrying `?team=` opens the create-issue modal over
whatever the user actually navigated to.

That parameter is not private to issue creation. ux-spec §4.14 gives it to
triage for the team switcher (`TR-`), and §4.16 CY-01 gives it to the cycle
header's team Select. Both are screens, not create links.

Reproduce today, before any T-006 code is involved:

1. Sign in and go to `/triage?team=PRO`.
2. The triage screen loads with the New issue modal open on top of it.

The same happens for a shared link to a team-scoped cycle.

## Why it matters beyond the annoyance

The modal is `aria-hidden`-ing the rest of the document while it is open, which
is correct Radix behaviour for a modal, so the screen underneath is not merely
covered, it is removed from the accessibility tree. A screen reader user
following a shared `?team=` link lands in a create-issue form with no
announcement of the page they asked for.

It also means no screen can use `?team=` as honest URL state, which is what
ux-spec asks two of them to do.

## The fix

Creation intent should be explicit rather than inferred from a field name that
other screens legitimately own. Options, pick one and record why:

1. Require a dedicated trigger, `?new=1` or `?compose=issue`, and read
   `title`, `priority` and `team` only as prefill alongside it. This keeps every
   documented create link working with a one-token addition and frees `?team=`
   everywhere.
2. Namespace the prefill: `?new.title=`, `?new.team=`.

Option 1 is smaller and reads better in a shared link.

## Interim state in T-006

`src/island/features/cycles/**` uses `?cycleTeam=` instead of the `?team=` the
ux-spec names, purely to avoid this. That is a deviation from §4.16 CY-01 and
it should be reverted to `?team=` in the same change that fixes this ticket.
`grep -rn "cycleTeam" src/island/features/cycles` finds every site.

Triage is left on `?team=` because changing it is outside T-006's owns list, so
`/triage?team=` is broken on `dev` today.

## Deliverables

1. The decision above, written down.
2. The create-host change, with the documented create links updated.
3. Revert cycles to `?team=` and delete the `cycleTeam` workaround.
4. RTL test: `/triage?team=PRO` renders triage with no dialog open, and the
   documented create link still opens the modal prefilled.

## Acceptance

No screen opens the create modal from URL state it did not ask for. All four
gates green.
