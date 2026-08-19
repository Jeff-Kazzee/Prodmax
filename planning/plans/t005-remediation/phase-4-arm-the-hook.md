# Phase 4: arm the progress consumer at the choke-point

Back to [overview.md](overview.md).

## Goal

The progress consumer runs on every issue write in a production process. Today it
runs on none of them. Arming stops being a runtime event and becomes a
compile-time fact, so the failure that produced this phase cannot recur.

## Blocked on

T-022 deliverable 1, the M1-to-M4 constraint amendment. The fix edits
`src/lib/services/issues-events.ts`, which is M1-owned. Phase 3 is a hard
prerequisite, because the consumer table is typed over `IssueTransition` and is
fed by the batch flush.

## Changes

`projects-progress.ts` calls `onIssueMutation(syncProjectProgress)` at module
scope. Importing that module is the only thing that arms the listener, and no
issue-write path imports it.

The T-005 work log confirms it in the built output. No chunk under
`dist/server/pages/api/issues/**` pulls in the chunk holding the registration. In
production `progress_cache` stays 0 unless a projects route happened to serve
first in the same process.

**Delete the runtime registry.** `onIssueMutation`, `recordIssueMutation`, and
the module-level `listeners` array all go. An earlier draft of this file called
for keeping `onIssueMutation` for T-016 and for the tests. Both halves are wrong.

§5 requires a client reconnecting with `Last-Event-ID: N` to receive every event
after N, replayed across a process restart. An in-memory listener array cannot
serve that. T-016's real subscription point is the `event_log` table, and its
real consumer is a static one.

Every prospective subscriber is mandatory. The progress counter, the event-log
writer in T-016, and the webhook dispatcher in M9 all have to run. A subscription
mechanism whose every subscriber is mandatory is a commit-hook list wearing a
costume, and the costume is what let one of them go missing. Keeping it alive
under a "T-016 needs this" label preserves both the mechanism that failed and the
reasoning behind the failure.

`grep -rn onIssueMutation tests/` returns nothing today, so the second half of
the old argument has no evidence behind it either.

**Consumers become a closed union and a `Record` over it.** `IssueConsumerName`
names every consumer, and `issueConsumers` maps each name to its function.
Declaring a name without supplying the consumer fails `astro check`. Each
consumer runs on the batch the phase 3 flush hands it, once per outermost
`runIssueWrite`, inside the transaction.

Today the union has one member, `"progress"`. T-016 adds `"eventLog"` and M9 adds
`"webhooks"` by adding a name and a function, and the type checker refuses the
half-done version.

Deleting the module-scope call at the bottom of `projects-progress.ts` closes the
loop. `issues-events.ts` imports `syncProjectProgress` directly, and
`projects-progress.ts` keeps only a type import back, so no runtime import cycle
forms. Two docstrings that assert the old behavior go with it, the header of
`projects-progress.ts` and the comment above the `parseProgressPoints` import in
`src/lib/services/projects.ts`.

**Tests get a scoped seam.** `withIssueConsumers(extra, fn)` adds consumers for
the duration of a callback and removes them on return, including on throw. A test
cannot leak a consumer into the next test, and a test cannot become the thing
that arms production. The seam only adds. It cannot remove or replace the static
consumers, so a passing test tells you nothing false about the production set.

**Not in this phase.** The failure policy for a consumer that throws is phase
11's to state. It is recorded here so a reader of this phase alone does not
assume this phase settled it.

## Data structures

```ts
type IssueConsumerName = "progress"; // T-016 adds "eventLog", M9 adds "webhooks"

type IssueConsumer = (batch: readonly IssueTransition[]) => void;

const issueConsumers: Record<IssueConsumerName, IssueConsumer>;

function withIssueConsumers<T>(extra: readonly IssueConsumer[], fn: () => T): T;
```

## Verification

**Static.** `npm run check` 0 errors, `npm test` 0 failures, `npm run build`
clean, `npm run e2e` all pass.

A type-level assertion backs the closed union. Adding a member to
`IssueConsumerName` without adding the matching entry to `issueConsumers` must
fail `astro check`, and the phase notes the observed error rather than assuming
it.

**Runtime.** The ordering repro in [testing.md](testing.md) is the acceptance
test for this phase. It must fail against the current tree and pass after. A fix
for a bug with no failing repro does not ship.

The repro seeds a project and an issue directly in SQLite, spawns a fresh server
process on its own port, completes the issue over HTTP through `/api/issues/:id`
before any projects route runs, and then reads `progress_cache` directly out of
the database file. Observed end state after this phase: `progress_cache` is 100.
Before this phase it is 0. Every constraint in that sequence carries weight, and
[testing.md](testing.md) says why, including why it cannot be a Playwright spec.

A second, cheaper static check backs it up. Grep the built output under
`dist/server/` and confirm that the chunk serving `/api/issues/[id]` now reaches
the progress consumer. That is the same evidence the T-005 work log used to find
the bug, read in the other direction.
