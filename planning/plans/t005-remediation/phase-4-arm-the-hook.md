# Phase 4: arm the progress hook at the choke-point

Back to [overview.md](overview.md).

## Goal

The progress consumer runs on every issue write in a production process. Today it
runs on none of them.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. The fix edits
`src/lib/services/issues-events.ts`, which is M1-owned.

## Changes

`projects-progress.ts` calls `onIssueMutation(syncProjectProgress)` at module
scope, which means the listener is armed only as a side effect of importing that
module. No issue-write path imports it. The T-005 work log confirms it in the
built output, where no chunk under `dist/server/pages/api/issues/**` pulls in the
chunk holding the registration. In production `progress_cache` stays 0 unless a
projects route happened to be served first in the same process.

The registration indirection exists because closing the module graph meant
editing an M1 file, which T-005 could not do. With T-022 landed, it can.

**Chosen fix, the direct call.** `recordIssueMutation` in
`src/lib/services/issues-events.ts` imports `syncProjectProgress` and calls it
before it walks the listener array. The choke-point then owns the consumer, and
arming is a compile-time fact rather than an import-order accident.
`onIssueMutation` stays, because T-016 needs a subscription point and the tests
use it.

The module-scope `onIssueMutation(syncProjectProgress)` call at the bottom of
`projects-progress.ts` is deleted, so `projects-progress.ts` no longer imports
`onIssueMutation` and no import cycle forms between the two modules. Two
docstrings that assert the old behavior are deleted with it, the header of
`projects-progress.ts` and the comment above the `parseProgressPoints` import in
`src/lib/services/projects.ts`.

**Alternative considered, closing the module graph.** Keep the listener and add a
side-effect-only import of `projects-progress` to `issues-events.ts`. It creates
the same import edge and needs the same amendment, but it leaves the guarantee
resting on a side effect that a bundler or a future refactor can drop. The direct
call is preferred for that reason. Either satisfies the acceptance test.

**Not in this phase.** The consumer still runs outside the transaction that wrote
the issue, so a throw inside it returns 500 on a committed mutation. Phase 11 covers
that. It is recorded here
so a reader of this phase alone does not assume this phase handled it.

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

**Runtime.** The ordering repro in [testing.md](testing.md) is the acceptance
test for this phase. It must fail against the current tree and pass after. A fix
for a bug with no failing repro does not ship.

The repro seeds a project and an issue directly in SQLite, starts a fresh server
process, completes the issue over HTTP through `/api/issues/:id` without any
projects route having been served, and then reads `progress_cache` directly out
of `data/prodmax.db`. Observed end state after this phase: `progress_cache` is
100. Before this phase it is 0. Every constraint in that sequence is load-bearing
and [testing.md](testing.md) says why.

A second, cheaper static check backs it up. Grep the built output under
`dist/server/` and confirm that the chunk serving `/api/issues/[id]` now
reaches the progress consumer. That is the same evidence the T-005 work log used
to find the bug, read in the other direction.
