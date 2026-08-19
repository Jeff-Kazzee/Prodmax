# T-026 — the counter-write gate catches two shapes out of fifteen

status: open
module: M1 data and API core
owns: tests/api/projects-choke-point.test.ts, planning/architecture.md §9
depends-on: T-023

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found by a cross-model review of the T-023 diff. T-023 took
`tests/api/projects-choke-point.test.ts` to zero known violations, which is true
and was earned. This ticket is about what that zero does and does not prove.

## 1. The regex misses most write shapes

`rawIssueWrites` matches `.update|insert|delete(issues)` and raw
`update|insert into|delete from issues`. A review probe reported these slipping
past:

- `import { issues as issueTable }` then `db.update(issueTable)`
- `import * as schema` then `db.update(schema.issues)`
- ``db.run(sql`update ${issues} set ...`)``
- `UPDATE "issues"` (quoted) and `UPDATE main.issues` (schema-qualified)
- `INSERT OR REPLACE INTO issues`, `INSERT OR IGNORE INTO issues`,
  `REPLACE INTO issues`. This family matters: `src/db/ids.ts:63` and
  `src/lib/services/issues-helpers.ts:98` already use that exact idiom on
  `team_counters`, so it is established in this tree.
- helper indirection, `writeTable(issues, patch)`
- `insert(sqlite, "issues", {...})`, which is the shape `scripts/seed.ts` uses

There is also a real false negative in `withoutComments`:
`.replace(/\/\/.*/g, " ")` strips from `//` to end of line even inside a string
literal, so a line carrying a URL hides every write after it on that line.

## 2. The gate does not watch `states.category` at all

This is the sharper gap. T-023 added a binding rule to architecture §9: a write
changing `states.category` or reassigning `issues.state_id` owes a repair.
Nothing enforces it. `src/pages/api/teams/[id]/states/index.ts:104` already
calls `db.update(states)` for reorder. Adding `category` to that patch, or
shipping a new admin endpoint that sets it, reintroduces exactly the T-023
defect and the gate still reports zero.

Per `pstack:principle-encode-lessons-in-structure`, this is the second time this
lesson has been written as prose with no structure behind it. The first time
produced T-023.

## 3. The gate scans `src/` only

`SRC = path.resolve(process.cwd(), "src")`. `scripts/seed.ts` is the tree's
largest raw writer of `issues` and is invisible to it. See T-025.

## Deliverables

1. Resolve the imported binding rather than matching the literal token `issues`,
   so an aliased or namespaced import is caught.
2. Add the `OR REPLACE` / `OR IGNORE` / `REPLACE INTO` family, optional
   identifier quoting, and schema qualification.
3. Strip string literals before stripping `//` comments.
4. A second inventory over `.update(states)` sites, allowlisted by file, seeded
   with `src/pages/api/states/[id]/index.ts` and the reorder handler as the two
   known entries.
5. Scan `scripts/` too, with a named allowlist entry rather than silence.
6. A test per shape above, proving the gate now catches it. Each must fail
   against the current gate.

## Acceptance

Every shape listed in section 1 is caught, with a test naming it. Adding
`category` to the reorder handler's patch fails the gate. All four gates green.
