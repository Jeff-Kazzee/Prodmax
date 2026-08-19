# T-027 — the gate runner cannot read its own test counts on CI

status: open
module: M0 scaffold
owns: scripts/gates.mjs, .github/workflows/gates.yml
depends-on: none

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found on the first CI run that ever executed in this repo, PR 11, run
`32295504451`, job `96205748029`.

## What happened

The job passed and the four gates really ran. The verdict block it printed:

```
════ GATE VERDICT ════
PASS build  complete
PASS check  244 files, 0 errors
PASS test   counts unparsed
PASS e2e    8 passed (7.9s)
ALL GATES PASS
```

The same runner locally prints
`PASS test   files: 45 passed (45) | tests: 205 passed (205)`.

## Why the counts vanished

`summarize` in `scripts/gates.mjs:37-41` matches `/Test Files\s+(.+)/` and
`/\n\s+Tests\s+(.+)/` against raw stdout. Without a TTY, vitest still emits ANSI
styling, so the captured line is not the plain text those patterns expect. From
the CI log:

```
[2m Test Files [22m [1m[32m45 passed[39m[22m[90m (45)[39m
```

The escape sequences sit between `Test` and `Files` and around every number, so
neither pattern matches and both counts degrade to `counts unparsed` together.

## Why this matters more than a cosmetic defect

`PASS` is still correct: it comes from the exit code, never from the parsed
numbers, and the header comment on `summarize` says exactly that. Nothing here
produced a false green.

What is lost is the evidence. `scripts/gates.mjs` exists because this project
shipped four "all gates green" reports that were false, and it prints both the
file count and the test count specifically because vitest reports them on
separate lines and a file can fail with zero failing assertions. CI is described
in the 2026-08-19 handoff as "the one that matters, because it takes every
summary out of the trust path." So the runner is half-blind on the single
surface built to be trusted over a human summary, and a reader pasting the CI
block has no count to check.

It also silently masks a real regression class. If a future change made the
test gate emit no counts locally as well, the output would look identical to
this, and `counts unparsed` reads as a formatting quirk rather than an alarm.

## A second CI defect, same run family

`timeout-minutes: 20` in `.github/workflows/gates.yml` is tight. The first
successful run used 12m50s cold, leaving about seven minutes of headroom. The
very next run, on a docs-only commit, was killed at 20m17s inside
`npx playwright install --with-deps chromium`. A re-run passed. So the browser
download alone can eat the whole margin, and the failure surfaces as a red check
on a PR that has nothing wrong with it.

A red check that is usually a flake is worse than no check, because it trains a
reader to re-run rather than to look. Cache the Playwright browsers on the
runner, raise the timeout, or both.

## Deliverables

1. Strip ANSI escape sequences from captured output before `summarize` runs.
   One pass over stdout, applied to every gate rather than just `test`, since
   `check` and `e2e` parse the same way and are one vitest or playwright
   version away from the same failure.
2. Make `counts unparsed` fail loudly rather than pass quietly. A gate that
   exits 0 but whose evidence cannot be read should print a distinct marker and
   set a non-zero exit, or at minimum print the last 20 raw lines so a reader
   can see what it could not parse. Decide which and record why.
3. A test for `summarize` against captured real output, one fixture with ANSI
   codes and one without, for all four gates.
4. Cache Playwright browsers keyed on the lockfile, and raise
   `timeout-minutes` so a cold install cannot consume the budget. Name the
   observed cold-run time in a comment so the next person tuning it has the
   number.

## Acceptance

The ANSI fixture parses to the same counts as the plain fixture, proven by a
test that fails against the current parser. A CI run prints real counts in the
verdict block. All four gates green.
