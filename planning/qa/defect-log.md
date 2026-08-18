# Defect log

Every defect found in verify is recorded here, then fixed and retested.
Status: `open` → `fixed` → `retested`.

## D-001 — undo tokens were not a migrated table

- **Found:** 2026-08-18, T-002 verify
- **Spec:** architecture §3.4 `POST /api/undo/:token` (FM-027); tables belong in Drizzle migrations (architecture §9)
- **Bug:** bulk undo created `undo_tokens` at runtime with `CREATE TABLE IF NOT EXISTS`, so production DBs, tests, and the schema snapshot could diverge. `move_team` undo also left `issue_redirects` rows, so a second move of the same issue could hit a unique-constraint failure.
- **Fix:** `undo_tokens` in `src/db/schema.ts` + migration `0001_undo_tokens`; bulk/undo use Drizzle inside one transaction and delete the matching redirect on restore.
- **Status:** fixed — retest with `tests/api/issues-more.test.ts` (second undo → 409; move_team undo restores `PRO-1` and drops the redirect)
