# T-021 — Polish: README, badges, release

status: open
module: release
assignee: —
owns: README.md, .github/workflows/** (if added), docs/ (if added)
depends-on: T-020

> Read `planning/tickets/README.md` first.

## Deliverables

- README: what Prodmax is, stack, setup (clone → install → migrate →
  seed → dev), the apostrophe-path note (why with-subst/patch-astro
  exist), screenshots (shell, board, doc editor, AI dock), feature list
  vs feature-matrix tiers, validation commands.
- CI (optional): GitHub Actions running check/test/build (e2e if
  feasible) with status badges — note Windows-runner apostrophe
  implications, or move nothing: badges may reference local gates only.
- Sweep for dead ScreenPending routes (every route should be real by now)
  and leftover TODO/FIXME markers; verify no `any` without justification
  comment; verify AGENTS.md still accurate.

## Acceptance
README renders correctly; all four gates green; zero ScreenPending
imports remain (grep).
