/**
 * The source-tree gate (T-005 remediation phase 11).
 *
 * No type forbids calling Drizzle directly, so a raw `db.update(issues)` that
 * bypasses `runIssueWrite` stays possible. This asserts the exact inventory of
 * raw `issues` writes rather than a threshold, because a suppression list that
 * grows is how this class of check dies.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(process.cwd(), "src");

/** The one file allowed to write `issues`: it holds the writer. */
const CHOKE_POINT = "src/lib/services/issues-events.ts";

/**
 * Raw writes that remain, each with the ticket that owns it. When a phase or a
 * ticket lands, its entry is DELETED from this map, never edited upward.
 */
const KNOWN_VIOLATIONS: Record<string, number> = {
  // T-023: PATCH and DELETE /api/states/:id change what an issue contributes
  // without writing the issue. The reassignment on DELETE is the raw write.
  "src/pages/api/states/[id]/index.ts": 1,
  // T-005 remediation phase 9: updateCycleScope (2) and closeCycle rollover (1)
  // still write issues directly. Phase 9 routes them through the writer.
  "src/lib/services/cycles.ts": 3,
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|astro)$/.test(entry)) out.push(full);
  }
  return out;
}

function rawIssueWrites(source: string): number {
  const matches = source.match(/\.(update|insert|delete)\(\s*issues\s*\)/g);
  return matches?.length ?? 0;
}

describe("issue-write choke-point", () => {
  it("writes issues only through the writer, plus the recorded open tickets", () => {
    const found: Record<string, number> = {};
    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
      if (rel === CHOKE_POINT) continue;
      const count = rawIssueWrites(readFileSync(file, "utf8"));
      if (count > 0) found[rel] = count;
    }
    expect(found).toEqual(KNOWN_VIOLATIONS);
  });

  it("the writer itself is the only place that writes issues", () => {
    const source = readFileSync(path.resolve(process.cwd(), CHOKE_POINT), "utf8");
    expect(rawIssueWrites(source)).toBe(3);
  });

  it("the total is the number this gate reports", () => {
    const total = Object.values(KNOWN_VIOLATIONS).reduce((a, b) => a + b, 0);
    // 11 before phase 3. 4 after phases 3 to 6. 1 after phase 9. 0 after T-023.
    expect(total).toBe(4);
  });
});
