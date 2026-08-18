# T-019 — M10 Settings/admin

status: open
module: M10 settings & admin
assignee: —
owns: src/pages/api/settings/** (except ai, which T-013 owns), src/island/features/settings/** (except ai page from T-014), tests/api/settings*, tests/island/features/settings*
depends-on: T-014

> Read `planning/tickets/README.md` first. Swaps `/settings/*` (R-32..R-47
  minus what earlier tickets already landed).

## docs-to-read
- architecture.md §3.9 (settings endpoints), §7 (permissions matrix)
- ux-spec.md §4.23 (S-23 all subsections), feature-matrix FM-008, FM-082..084

## Deliverables

- Profile (R-32: name/avatarSeed — users PATCH), sessions (R-33: list +
  revoke other sessions), appearance (R-34: theme/density surfaced from
  the M2 system), notifications prefs (R-35), members admin UI (R-36:
  role change, remove, invites — over the M1b API), teams admin (R-37/38:
  states reorder/rename, triage config), workflows (R-39), labels manager
  (R-40), templates list (R-41 if not done in T-010), import/export link
  (R-45 shell if T-018 pending), workspace settings (R-46: name/slug/
  timezone, delete workspace type-to-confirm), admin activity (R-48).
- All controls wired to real endpoints — no placeholder controls; admin
  gates per §7 enforced server-side (already M1) and reflected in UI.

## Acceptance
Vitest endpoint tests for new settings routes; RTL per screen happy
paths; permission-gate tests (member vs admin vs owner). All four gates
green.
