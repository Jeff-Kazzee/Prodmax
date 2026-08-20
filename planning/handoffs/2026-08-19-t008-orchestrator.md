# Handoff, 2026-08-19: T-007 is in review, and the queue is ready to parallelise

Supersedes every earlier file in this folder. Written for an **orchestrator**
that will dispatch subagents rather than do the work itself.

## Where the tree is

`dev` is at `0da5180`. T-007 sits on `feat/t-007-docs-api` at `5ec7c14`, eight
commits, open as PR #20 into `dev`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  314 files, 0 errors
PASS test   files: 64 passed (64) | tests: 406 passed (406)
PASS e2e    9 passed (13.2s)
ALL GATES PASS
```

`prod` is untouched. `main` is historical. Merge PR #20 before starting T-008:
it is the whole M5 API surface and T-008 through T-010 all sit on it.

## What T-007 shipped

The ten endpoints of architecture §3.6, plus seven services and five validation
modules. Read `planning/tickets/T-007-docs-api.md` in full, including **both**
work logs, before touching anything under `src/lib/services/{pages,blocks,
templates,search}*` or `src/pages/api/{pages,blocks,templates,search}/**`.

Three design decisions the next tickets inherit and must not undo:

- **Branded tokens carry the invariants.** `DocsCtx` (only `requireDocs` builds
  one, and it 403s guests per §7), `SanitizedBlock` (only `sanitizeBlock`, and
  it derives the `text` column from the props it just cleaned), `Placement`
  (only `resolvePlacement`, and it enforces §2.6's children column). A service
  that skips one does not compile. Do not add an escape hatch.
- **One writer per table.** `blocks-write.ts` is the only module that writes
  `blocks`; `pages.ts` and `pages-trash.ts` are the only two that write
  `pages`. `tests/api/blocks-choke-point.test.ts` asserts the exact inventory
  and now detects all sixteen write shapes, including drizzle's own table
  interpolation. Adding a second writer turns it red, and that is the point.
- **Page open is one query.** `tests/api/blocks.test.ts` counts statement
  *executions*, not prepares. See the trap list below for why that distinction
  cost this session its worst finding.

## The next ticket

**T-008, M5b Docs home + page tree + trash.** Lowest-numbered open ticket whose
dependencies are done, once PR #20 merges.

It needs a migration: `favorites` carries `check(entity_type IN ('project'))`,
so DH-03's favorites strip is unreachable without one. That migration
serializes behind `0002_parallel_warhawk.sql`. Nothing else in the queue needs
one right now, so T-008 should take it early rather than at the end.

## How to parallelise this, concretely

Architecture §8 makes modules file-disjoint, so tickets in different chains can
run at once. The current queue splits into four independent lanes. Dispatch one
subagent per lane, not one per ticket, so a lane's tickets stay serial with
each other and cannot collide on a file.

| Lane | Tickets | Owns, roughly | Notes |
|---|---|---|---|
| A, docs UI | T-008, then T-009, T-010 | `src/island/features/docs/**`, `src/components/blocks/**` | The long pole. T-008 takes the favorites migration. |
| B, data repairs | T-034, T-035 | `scripts/seed.ts`, `src/db/fts.sql`, `src/db/fts.ts` | Both are M1/M0 files. Small, independent, and they unblock the demo bench. |
| C, API repairs | T-036, T-032 | `src/pages/api/teams/**`, `src/lib/api/provision.ts`, `src/pages/api/cycles/**` | T-036 blocks any test needing two usable teams. |
| D, spec | T-037 | `planning/architecture.md` only | Docs-only. Cheap. Do it first so lane A reads a §3.6 that matches the code. |

T-038 (bookmark unfurl, search snippets) is **not** in a lane. Its unfurl half
is an SSRF surface and needs a security design and Jeff's sign-off before any
code. Its search-snippet half can fold into lane A with T-008 if that agent has
capacity, since S-19 is the consumer.

Serialisation rules that are not negotiable:

1. **Migrations are serial.** One lane holds the migration token at a time.
   Lane A has it for T-008. Any other lane that discovers it needs a migration
   stops and reports rather than generating one.
2. **`planning/tickets/README.md` is CRLF and every lane edits its index row.**
   That file is a guaranteed conflict. Either have the orchestrator make all
   index edits itself, or serialise them at the end.
3. **One branch per ticket, cut from `dev`, PR into `dev` only.** Never `prod`.

## The validation bar, and it is the whole point

This session's four gates were green while the branch carried a critical bug, two
high-severity bugs, two missing binding conventions, and three assertions that
could not fail. Green gates are necessary and nowhere near sufficient.

Require of every lane, before it reports done:

1. **`node scripts/gates.mjs`, whole, never through a pipe, block pasted
   verbatim.** A pipeline returns the last command's status, which is how this
   project shipped four green gates over a failing run. Reseed first:
   `npm run db:migrate && npm run seed`.
2. **Mutation, not reading, as proof.** For every new guard: break the thing it
   guards, confirm that specific assertion fails, record the message. Assert
   the anchor string was present before replacing it, so a no-op edit cannot
   masquerade as proof.
3. **Ask what a wrong implementation would also produce.** Pick fixture numbers
   only a correct implementation can reach. The search fixtures in
   `tests/api/search.test.ts` carry 20 filler documents because the bm25 title
   weight is 1e-6 at three documents and 1.2 at twenty; a small-corpus ranking
   assertion passes on floating-point noise.
4. **Shuffle before trusting.**
   `npx vitest run <suite> --sequence.shuffle.tests --sequence.seed=2`.
   Chase order-dependence rather than papering over it: last session's
   order-dependent failure was a real product bug (T-033).
5. **Adversarial review at a frozen commit.** Commit, then hand reviewers
   `git diff <base>..<sha>`, never a tree still being edited. Four lenses paid
   for themselves here: state transitions, security and permissions, vacuous
   assertions, spec conformance. The vacuous-assertion lens found the most
   valuable defect in the session and no other lens would have.
6. **Reviewer findings are claims.** Verify each against the code before acting.
   One reviewer here reported an existing test as near-vacuous; mutating the
   real source and running the real test showed the guard holds, and a wrong
   ticket was nearly filed on it.

## Traps that cost this session real time

Each of these was hit, not imagined.

- **A prepared-statement counter that counts `prepare` is blind.** A
  better-sqlite3 `Statement` is reusable, so the N+1 a real regression produces
  (hoist the prepare, execute per row) calls `prepare` once. The fixed helper
  in `tests/api/pages-harness.ts` wraps the Statement and records on `all`,
  `get`, `run`, `iterate`. Reuse it; do not write a new one.
- **`git checkout -- <file>` reverts the whole file.** Using it to undo a
  mutation on a file that also holds uncommitted fixes eats them. It happened
  twice; the second cost four fixes. Commit before mutating, always.
- **`vitest -t` takes a regex.** `-t "O(visible)"` matches nothing because the
  parentheses are a capture group, and a run with zero tests looks like a pass
  to a naive script. Assert that the filter actually selected tests.
- **Backticks inside a double-quoted shell string get command-substituted.**
  A commit message here lost a phrase that way. Use `python3 - <<'PY'` or a
  `-F` file.
- **Python's text mode rewrites line endings on Windows.** A one-token edit to
  an LF file showed 145 changed lines. Read and write bytes, and run
  `git diff --stat` after every scripted edit. `planning/tickets/README.md` and
  `planning/architecture.md` are CRLF; most source is LF.
- **`LIKE 'prefix%'` is case-insensitive in SQLite and cannot use a BINARY
  index.** Measured: `SCAN` versus `SEARCH USING COVERING INDEX`. The subtree
  helpers use a half-open range for this reason.
- **A guard can be complete on one side and absent on the other.** `Placement`
  stops a child being written under a leaf and does nothing about the parent
  being turned into a leaf. When a rule has two directions, test both.

## Needs Jeff, not an agent

- 14 Dependabot vulnerabilities on the default branch, 3 high. Dependency
  changes need his approval under the security law.
- T-038's unfurl endpoint fetches a client-supplied URL. Design and approval
  before code.
- Any promotion of `dev` to `prod`.
