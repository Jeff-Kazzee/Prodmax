# Prodmax — Claude Code rules

Read `AGENTS.md` (project conventions, binding) and `planning/tickets/README.md`
(work protocol: claim, build, four gates, commit) before doing anything.

The work queue is `planning/tickets/T-001…T-021`. Pick the lowest-numbered
`status: open` ticket whose `depends-on` are all `done`. Work on a feature
branch cut from `dev`; PR into `dev` only. `prod` is the finished product
and is updated only on an explicit release.

Project root: `C:\Users\jeffk\big-projects\Prodmax` (moved here 2026-08-18 —
the old apostrophe-path workarounds in `scripts/` are dormant no-ops; don't
remove them). Kill dev servers by port PID, never broad-kill node.

## pstack

`poteto-mode` routes non-trivial work. The Prodmax protocol outranks it on
every conflict:

- PRs target `dev`. pstack's Opening a PR step does not choose the branch.
- Done means the four gates in `AGENTS.md`. `npm run e2e` drives the real app,
  so the gates already satisfy `principle-prove-it-works`.
- T-001 through T-021 already decompose the work. Do not re-plan it.
- A ticket's `owns:` list bounds the diff. The file-disjoint chains in
  `planning/tickets/README.md` are the throughput plan.

What pstack adds that the ticket protocol does not cover:

| When | Skill |
|---|---|
| The ticket introduces new types or services | `/architect` before writing code |
| Touching a module an earlier session built | `/how` over it first |
| Before opening the PR | `/interrogate` on the diff |
| Before each commit | `/deslop` on the diff |
| After opening the PR into `dev` | `/babysit`, then `/fix-ci` on red checks |
| A defect with a reproducible failure | `/tdd` and `principle-fix-root-causes` |
| A ticket built by a swarm or another agent | `/interrogate` before the gates, not after |

Skip `/create-verification-skill`. Playwright plus the demo login, port rules,
and reseed command in `planning/tickets/README.md` already do that job.

## Reporting a gate

Every gate failure this project has shipped got reported as green. The same
mechanism did it each time, so this is a rule rather than advice.

**Run `node scripts/gates.mjs` and paste its verdict block verbatim.** Never run
a gate through a pipe. `npm test 2>&1 | tail -5` exits 0 no matter what vitest
did, because a pipeline returns the status of its last command. That is how a
run with a failing test file turns into four green gates.

**`Tests 197 passed` is not the count that matters.** Vitest prints test files
and tests as two separate lines, and a file can fail with zero failing
assertions when it errors at import or setup. A reader scanning for a number
finds the wrong one. The verdict block prints both.

**A falsification must assert its own anchor.** Breaking a thing to prove a test
catches it is worthless when the edit silently matched nothing. Assert the
string was present before replacing it, and confirm the test failed for the
reason you expected.

**Do not report a phase or deliverable landed without naming its evidence.** A
commit SHA, a failing-then-passing test, or an observed value. "Implemented"
without evidence is the claim that hid a skipped phase through an entire
remediation.

CI runs the same runner on every PR into `dev`. A green local summary that
disagrees with a red check means the summary is wrong.
