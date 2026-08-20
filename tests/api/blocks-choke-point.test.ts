/**
 * The source-tree gate for block writes, on the pattern established by
 * tests/api/projects-choke-point.test.ts.
 *
 * `SanitizedBlock` and `Placement` make it impossible to *call* the writer
 * with unsanitized props or an unchecked parent. Neither can stop a new module
 * from ignoring the writer and reaching the table directly, which is the one
 * hole a type cannot close. This asserts the exact inventory rather than a
 * threshold, because a suppression list that grows is how this kind of check
 * dies.
 *
 * It also pins the reverse fact for pages: T-007 splits page writes across
 * pages.ts and pages-trash.ts, so the assertion there is which files, not how
 * many writes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(process.cwd(), "src");

/** The one file allowed to write `blocks`: it holds the writer. */
const CHOKE_POINT = "src/lib/services/blocks-write.ts";

/**
 * Raw writes that remain, each with the ticket that owns it. When a ticket
 * lands, its entry is DELETED from this map, never edited upward.
 */
const KNOWN_VIOLATIONS: Record<string, number> = {};

/** Files permitted to write `pages`. Anything else is a new write path. */
const PAGE_WRITERS = ["src/lib/services/pages-trash.ts", "src/lib/services/pages.ts"];

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

/** Prose is not a write. A comment naming the table must not trip the gate. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*/g, " ");
}

/**
 * Two shapes reach a table: the Drizzle builder, and raw SQL through `run`.
 * Matching only the builder would let `` db.run(sql`UPDATE blocks ...`) ``
 * past, and that shape already exists in this tree for `pages`.
 */
function rawWrites(input: string, table: string): number {
  const source = withoutComments(input);
  const builder = source.match(new RegExp(`\\.(update|insert|delete)\\(\\s*${table}\\s*\\)`, "g"))?.length ?? 0;
  const raw = source.match(new RegExp(`(update|insert\\s+into|delete\\s+from)\\s+${table}`, "gi"))?.length ?? 0;
  return builder + raw;
}

function inventory(table: string, allowed: readonly string[]): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of sourceFiles(SRC)) {
    const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
    if (allowed.includes(rel)) continue;
    const count = rawWrites(readFileSync(file, "utf8"), table);
    if (count > 0) found[rel] = count;
  }
  return found;
}

describe("block-write choke-point", () => {
  it("writes blocks only through the writer", () => {
    expect(inventory("blocks", [CHOKE_POINT])).toEqual(KNOWN_VIOLATIONS);
  });

  it("the writer itself really does write blocks", () => {
    // Without this, deleting every write in the codebase would make the
    // assertion above pass, and the gate would be guarding nothing.
    const source = readFileSync(path.resolve(process.cwd(), CHOKE_POINT), "utf8");
    expect(rawWrites(source, "blocks")).toBeGreaterThan(0);
  });
});

describe("page writes stay in the two page services", () => {
  it("no other module writes pages", () => {
    expect(inventory("pages", PAGE_WRITERS)).toEqual({});
  });
});

describe("T-007 does not create issues", () => {
  /**
   * Template instantiate returns a prefilled payload rather than an issue
   * (see the header of src/lib/services/templates.ts). This asserts that from
   * the other side: if a later change makes instantiate write the table, the
   * existing issue choke-point gate turns red and so does this.
   */
  it("templates never write the issues table", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/services/templates.ts"), "utf8");
    expect(rawWrites(source, "issues")).toBe(0);
  });
});
