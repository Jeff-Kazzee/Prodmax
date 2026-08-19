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
- The work is decomposed into T-001…T-021. Do not re-plan it.
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
