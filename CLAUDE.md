# Prodmax — Claude Code rules

Read `AGENTS.md` (project conventions, binding) and `planning/tickets/README.md`
(work protocol: claim, build, four gates, commit) before doing anything.

The work queue is `planning/tickets/T-001…T-021`. Pick the lowest-numbered
`status: open` ticket whose `depends-on` are all `done`. Work on a feature
branch cut from `dev`; PR into `dev`; `prod` is the finished product.

Project root: `C:\Users\jeffk\big-projects\Prodmax` (moved here 2026-08-18 —
the old apostrophe-path workarounds in `scripts/` are dormant no-ops; don't
remove them). Kill dev servers by port PID, never broad-kill node.
