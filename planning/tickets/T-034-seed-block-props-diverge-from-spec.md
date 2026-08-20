# T-034 : seeded blocks do not match the §2.6 props contract

status: done
module: M0 foundation / M1 data
owns: scripts/seed.ts, tests/db/seed.test.ts
depends-on: none
assignee: claude-code session 2026-08-19 (fix/t-034-seed-block-props)

> Read `planning/tickets/README.md` first (shell rules, gates, anti-stall).

Found while building T-007, by reading the seed against architecture §2.6
before writing the block validation the ticket asks for.

## What is wrong

Architecture §2.6 gives every block type a props contract. `scripts/seed.ts`
writes a different shape for four of the five types it seeds, and omits
`props.text` everywhere.

| Type | §2.6 props | `scripts/seed.ts` writes |
|---|---|---|
| `paragraph`, `heading_1/2`, `bulleted_list` | `{text: richText[]}` | `{}` |
| `todo` | `{text: richText[], checked}` | `{checked}` |
| `callout` | `{emoji, text}` | `{style, emoji}` |
| `code` | `{code, language, wrap}` | `{language}` |
| `issue_view` | `{viewId: FK views, layout?}` | `{issueId, display}` |

The seed puts the block's content in the `text` column instead. §2.6 defines
that column as "extracted plain text of the block (FTS + summaries)", a
derived mirror of `props`, not the source of truth. Seeded blocks therefore
have content that no spec-conformant reader will find, because it reads
`props.text`.

`issue_view` is the sharpest one. §2.6 and ux-spec ED-09 both make it an
embedded **saved view**: `{viewId}` renders the view's rows live. The seed
points it at a single issue id under a key (`issueId`) that no consumer will
look for, so the demo bench's one embed block cannot render as specified.

`callout.style` is not in the contract at all.

## Why it matters

Nothing catches it today because nothing reads `props` yet. That changes with
the M5 chain:

- T-007 validates `props` per type on every block write. A PATCH of any seeded
  block sends the whole props object back and will be rejected.
- T-009 renders blocks from `props`. Every seeded page renders empty.
- T-010 renders `issue_view` embeds and finds no `viewId`.

The demo bench is the thing agents and reviewers look at to decide whether the
docs surface works. It will look broken for a reason that is not in the code
under review.

## Reproduce

```bash
npm run db:migrate && npm run seed
```

```sql
SELECT type, props, text FROM blocks LIMIT 5;
```

Every row has content in `text` and no `text` key in `props`.

## The fix

1. Give each seeded block a spec-shaped `props`, with `props.text` as a
   `richText[]` array (`[{type:'text', text:'…', marks:{}}]` for plain runs).
2. Keep the `text` column, but derive it from `props` with the same extractor
   the service layer uses, rather than hand-writing it. T-007 adds that
   extractor at `src/lib/services/blocks-richtext.ts`; the seed cannot import
   from `@/` (node runs the file directly, see architecture §9 note on
   `scripts/seed.ts`), so either duplicate it and pin both with a test, as
   T-025 did for the progress caches, or extract it to a plain-JS module both
   can load.
3. Replace `issue_view {issueId, display}` with `{viewId}` pointing at one of
   the seeded views, and drop `callout.style` for the contract's `{emoji, text}`.

## Acceptance

- Every seeded block's `props` validates against the T-007 per-type schemas.
  Assert this in `tests/db/seed.test.ts` by importing the schemas and parsing
  each row, so the seed cannot drift from the contract again.
- Every seeded block's `text` column equals the extractor's output for its
  `props`, pinning the two implementations to each other.
- The seeded `issue_view` block's `viewId` resolves to a live seeded view.
- All four gates green.

## Work log

Session 2026-08-19, branch `fix/t-034-seed-block-props`, cut from `dev` at
`606b77f`.

```
════ GATE VERDICT ════
PASS build  complete
PASS check  314 files, 0 errors
PASS test   files: 64 passed (64) | tests: 410 passed (410)
PASS e2e    9 passed (10.1s)
ALL GATES PASS
```

Exit code 0, counts parsed. `dev` was 406 tests, so this adds 4.

### One correction to this ticket's own premise

The ticket said the seed "cannot import from `@/`" and proposed either
duplicating the extractor or moving it to a plain-JS module. Only the first
half is true. `scripts/seed.ts` already imports `../src/db/positions.ts` and
`../src/db/fts.ts` by relative path; it is the `@/` alias specifically that
node cannot resolve. `src/lib/validation/blocks-richtext.ts` imports nothing
but zod, so the seed now imports `richTextToPlain` from it directly.

That removes the duplication the ticket was prepared to accept. There is one
extractor, not two pinned to each other.

### What changed

Every seeded block now carries its content in `props` per section 2.6, and the
`text` column is derived from those props rather than hand-written:

- `callout` is `{emoji, text}`; `style` is gone, it was never in the contract.
- `code` is `{code, language, wrap}`.
- `todo` is `{checked, text}`.
- Text-bearing types carry `props.text` as a `richText[]` run.
- `issue_view` is `{viewId, layout}` pointing at the seeded "Urgent & high"
  view. It carried `{issueId, display}`, which no consumer reads, so the demo
  bench's one embed block could not render as ED-09 specifies.

View ids are allocated ahead of the pages section so the block can reference a
real view; the views insert below consumes the same ids.

### Falsification

| Mutation | Failure |
|---|---|
| callout reverts to `{style, emoji}` | `expected [ Array(1) ] to deeply equal []` |
| `text` hand-written instead of derived | `expected [ …(24) ] to deeply equal []` |
| `issue_view` points at an issue again | `expected '01a01d5e-…' to be undefined` |
| every block text emptied | `expected [ …(23) ] to deeply equal []` |

The last one exists because the derive-check loop is satisfied by a seed that
writes `""` everywhere, so the test also asserts more than 15 blocks carry
non-empty text.

The props test parses each row against the shipped `BLOCK_SPECS` rather than
against a transcribed copy, so the assertion is the contract itself and cannot
drift from it.

### Not done

`scripts/seed.ts` remains raw SQL rather than going through the service layer,
per the reasoning recorded in architecture section 9. The new props are
therefore validated by the test rather than by the write path.
