# Phase 8: cycle status derived on read

Back to [overview.md](overview.md).

## Goal

A cycle whose start time has passed reports `active`. Today it reports `future`
forever unless somebody patches it.

## Blocked on

Nothing. Every change is inside `src/lib/services/cycles.ts`, which T-005 owns.

## Changes

`deriveStatus` runs at three moments only, inside `createCycle`, inside
`patchCycle`, and as part of the next-cycle creation inside `closeCycle`. A cycle
created today to start tomorrow is written as `future` and nothing ever revisits
it. §2.4 calls the column derived and stored. It is stored but never re-derived.

A `syncDerivedStatus` helper re-derives status for rows whose stored status is
not `completed`, and writes the row back when the derived value differs from the
stored one. `listCycles` calls it over the rows it just read, batching the writes
into one statement per distinct target status. The single-row read paths,
`patchCycle`, `updateCycleScope`, and `closeCycle`, run it through `requireCycle`
so a surgery or a scope call also converges the row it touched.

`completed` rows are skipped entirely. `closeCycle` is the only writer of that
value and §2.4 keeps it that way.

Two properties worth stating so the behavior is not misread later:

- The derivation stays two-valued. `starts_at > now` gives `future`, otherwise
  `active`. A cycle past its `ends_at` stays `active` until somebody closes it.
  Auto-completion at `ends_at` is the rollover job §2.4 describes and is not this
  phase.
- Writing on a GET is intentional. §9's no-recompute-on-read rule is about
  counters, and this writes a single derived enum per stale row rather than
  scanning issues. The alternative is a scheduler, which is more machinery than
  the problem needs.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

Unit coverage: insert a cycle with `status = 'future'` and a `starts_at` in the
past, call `listCycles`, and assert both the returned DTO and the stored row read
`active`. A second case asserts a `completed` row with a past `starts_at` is left
alone.

**Runtime.** Deterministic, no waiting.

1. `npm run db:migrate && npm run seed`, `npm run build`,
   `npm run preview -- --port 4321`.
2. Create a cycle over HTTP with `startsAt` an hour in the future. Confirm the
   response reads `future`.
3. In `data/prodmax.db`, set that row's `starts_at` to an hour in the past,
   leaving `status` as `future`. This is the state a real clock produces.
4. `GET /api/cycles?wsId=&teamId=`.
5. Observed end state: the response reads `active`, and the `cycles.status`
   column read directly out of `data/prodmax.db` also reads `active`, which
   proves the derived value was persisted rather than only serialized. Before
   this phase both stay `future`.
