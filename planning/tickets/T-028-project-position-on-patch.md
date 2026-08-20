# T-028 : projects cannot be reordered, because the PATCH has no position

status: done
module: M4 projects & cycles
owns: src/lib/validation/projects.ts, src/lib/services/projects.ts, tests/api/projects*.test.ts
depends-on: none
assignee: claude-opus-5 session 6858dcdc, 2026-08-19

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-006.

## What is missing

`planning/tickets/T-006-projects-ui.md` lists "projects list (grouped by
status, reorder)" as a deliverable. Reorder did not ship, because there is no
endpoint behind it.

`projects.position` exists, is a fractional key, and `listProjects` already
orders by it. `createProject` allocates one through `nextProjectPosition`.
What is absent is any way to change it: `patchProjectSchema` in
`src/lib/validation/projects.ts` has no `position` field, and `updateProject`
in `src/lib/services/projects.ts` has no branch for one.

So a drag handle in the S-15 list would either fail or persist nowhere.
AGENTS.md forbids a control that is not wired to real behavior, so T-006
shipped the list in server position order with no drag, and
`tests/island/features/projects/list.test.tsx` carries an assertion that no
reorder control exists, so a future agent cannot add one without also reading
this ticket.

## The shape to copy

Milestones already solved this. `patchMilestoneSchema` in
`src/lib/validation/projects-milestones.ts` accepts a `position` validated by
`isValidKey` from `src/db/positions.ts`, and `updateMilestone` applies it.
Mirror that exactly rather than inventing a second convention.

## Deliverables

1. Add `position` to `patchProjectSchema`, validated with `isValidKey`, and an
   `if (input.position !== undefined)` branch in `updateProject`.
2. An API test that reorders three projects and reads the list back in the new
   order, plus one that rejects a malformed key with the §3 error shape.
3. Delete the no-reorder assertion in
   `tests/island/features/projects/list.test.tsx` in the same change that adds
   the drag, so the guard never outlives the gap it guards.

## Acceptance

A project moved between two siblings reads back between them from
`GET /api/projects`. All four gates green.

## Work log

Session `6858dcdc`, 2026-08-19. Branch `feat/t-028-project-reorder`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  280 files, 0 errors
PASS test   files: 55 passed (55) | tests: 288 passed (288)
PASS e2e    9 passed (8.6s)
ALL GATES PASS
```

### What shipped

`position` on `patchProjectSchema`, validated by `isValidKey`, and the
matching branch in `updateProject`. Copied from the milestone convention
rather than invented, as the ticket asked.

The S-15 list drags to reorder within a status group. The drop writes a
fractional midpoint between the drop target and its predecessor, so no sibling
row is rewritten.

### A decision the ticket did not name

A drop onto a different status group is ignored rather than treated as a
status change. Position and status are separate facts, each row already has a
status select, and making one gesture mean two things would leave no way to
reorder near a group boundary without risking an unintended status write.
There is a test for the refusal.

### Deliverable 3

The no-reorder guard in `tests/island/features/projects/list.test.tsx` is
gone, replaced by tests that drive the real drag. That guard was also one of
the vacuous assertions found during the T-006 review: it asserted no PATCH was
recorded in a test that clicked nothing.

### Falsification

| Break | Failure |
|---|---|
| Remove the `position` branch from `updateProject` | `expected [ 'Alpha', 'Beta', 'Gamma' ] to deeply equal [ 'Alpha', 'Gamma', 'Beta' ]` |
| Allow a drop across status groups | `expected [ { …(2) } ] to deeply equal []` |

The omitted-position test is the sensor for the first: a service that reset
position on every write would still pass the reorder test alone.

