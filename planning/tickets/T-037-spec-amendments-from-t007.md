# T-037 : spec amendments the T-007 implementation owes

status: done
module: docs only (M0 spec)
owns: planning/architecture.md
depends-on: T-007
assignee: claude-code session 2026-08-19 (docs/t-037-spec-amendments)

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

T-007 shipped three deliberate divergences from the letter of §3.6 and §2.7.
Each is recorded in T-007's work log with its reasoning, and each was ruled
correct by the review. None of them has been written back into the spec, so
`planning/architecture.md` currently disagrees with the shipped API. T-008
reads §3.6 to build the docs home, so the disagreement has a consumer.

This ticket is documentation only. No code changes.

## 1. The tree endpoint takes `?wsId=`, not a path segment

§3.6 row 1 reads:

```
| GET | /api/workspaces/:wsId/pages/tree | sidebar tree (visible nodes only, path-indexed) |
```

Shipped: `GET /api/pages/tree?wsId=`.

Two reasons, both checked. The path-embedded form lands in
`src/pages/api/workspaces/[id]/pages/tree.ts`, which §8 assigns to M1 and
T-007's `owns:` does not cover, and §8's overlap rule says a module never edits
another's files. It is also the only path-embedded wsId anywhere in §3: every
other row in §3.1 through §3.9 takes `?wsId=` or an entity id, and so does
every route in the codebase.

Amend the row to `GET /api/pages/tree?wsId=&expanded=`.

## 2. Template instantiate returns a payload for the issue kind

§3.6 row 10 reads:

```
| POST | /api/templates/:id/instantiate | issue -> new issue; page -> new page with block clone |
```

Shipped: the page kind creates a page and clones the tree; the issue kind
returns `{kind:"issue", payload}` for the client to post to `/api/issues`.

The reason is §9's own counter-write rule. `tests/api/projects-choke-point.test.ts`
asserts the set of files writing the `issues` table is exactly one with a total
of zero violations, and an issue created outside `runIssueWrite` never drives
the progress-delta consumer, so no project counter would move and nothing
self-heals. T-007's deliverable text already said "prefilled issue payload";
only the §3.6 table gloss disagrees.

Amend the row to say the issue kind returns a prefilled payload, and add a
sentence naming the choke point as the reason.

## 3. The templates `data` shape is camelCase

§2.7 gives:

```
issue: {title?, description_md?, priority?, state?, labels[], sub_issues[{title,…}]}
```

Shipped: `descriptionMd`, `stateId`, `subIssues`. The schema is `.strict()`, so
the spec's literal keys are rejected rather than aliased.

camelCase is the repo-wide convention at the API boundary (every DTO and every
zod schema in `src/lib/validation/**` uses it, and Drizzle maps snake_case
columns to camelCase fields), so the shipped shape is the consistent one and
§2.7 is the outlier. `state` to `stateId` is a genuine clarification: the value
is a state id, not a state name.

Amend §2.7's `data` row to camelCase, and note `stateId`.

## Acceptance

- The three rows above read as shipped, each with a one-line reason.
- `planning/architecture.md` keeps its CRLF line endings. Check with
  `git diff --stat`: a three-row edit must not show hundreds of changed lines.
- T-007's work log gains a line pointing at this ticket as the resolution.
- No code changes, so `npm run check` and `npm test` are unchanged. Run the
  four gates anyway and paste the block.

## Work log

Session 2026-08-19, branch `docs/t-037-spec-amendments`, cut from `dev` at
`606b77f`.

Three rows amended in `planning/architecture.md`, each cross-checked against
the shipped code rather than against the ticket text:

| Row | Now reads | Verified against |
|---|---|---|
| section 3.6 tree | `GET /api/pages/tree?wsId=&expanded=` | `src/pages/api/pages/tree.ts` |
| section 3.6 instantiate | page clones blocks; issue returns a prefilled payload | `templates.ts:213`, `{ kind: "issue"; payload: IssueTemplateData }` |
| section 2.7 data | camelCase, `descriptionMd`, `stateId`, `subIssues` | `issueTemplateDataSchema` in `src/lib/validation/pages-templates.ts` |

Each amendment carries a one-line reason naming T-037, so a later reader sees
why the row diverges from its neighbours rather than treating it as drift.

`git diff --stat` shows `3 insertions(+), 3 deletions(-)`, so the file's CRLF
line endings survived. No em dashes added.

Docs only, so no code changed. Gates run anyway:

```
════ GATE VERDICT ════
PASS build  complete
PASS check  314 files, 0 errors
PASS test   files: 64 passed (64) | tests: 406 passed (406)
PASS e2e    9 passed (12.2s)
ALL GATES PASS
```

Exit code 0, counts parsed. Run on the merged `dev` at `606b77f`. `git diff dev
--name-only` on this branch lists only `planning/**`, so the compiled tree is
byte-identical to the one that produced this block and it is the evidence for
both.

### Not done

`?types=comment` still returns VALIDATION rather than an empty result. The
divergence is recorded in T-007's work log and is defensible (section 2.10
folds comment bodies into the issue body, so a comment type could return
nothing), but ux-spec section 4.19's chip row does show a Comments chip. That
is a product question for T-008's search screen, not a spec typo, so it is left
open rather than amended away here.
