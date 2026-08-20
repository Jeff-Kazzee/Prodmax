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
 * Every shape that reaches a table, not just the two obvious ones.
 *
 * The first version matched `.update(blocks)` and a bare `UPDATE blocks`, and
 * missed eleven of sixteen real shapes. A reviewer added a genuine, effective
 * block write to another module using drizzle's own table interpolation, and
 * every gate here stayed green while the write landed. WRITE_SHAPES at the
 * bottom of this file is the fixture that pins the detector itself.
 *
 * Covered: the builder with a bare, namespaced or spaced table; raw SQL with
 * the table bare, quoted, schema-qualified or drizzle-interpolated; and the
 * INSERT OR REPLACE / REPLACE INTO / UPDATE OR IGNORE spellings.
 */
export function rawWrites(input: string, table: string): number {
  const source = withoutComments(input);
  // Optional `${` from a drizzle sql template, optional `schema.` namespace,
  // optional quoting. The trailing boundary keeps `blocks_audit` out.
  const named = String.raw`(?:\$\{\s*)?(?:\w+\.)?["'\`]?` + table + String.raw`["'\`]?\b`;
  const builder = new RegExp(String.raw`\.(?:update|insert|delete)\(\s*` + named, "gi");
  const rawSql = new RegExp(
    String.raw`(?:insert(?:\s+or\s+\w+)?\s+into|replace\s+into|update(?:\s+or\s+\w+)?|delete\s+from)\s+` + named,
    "gi",
  );
  return (source.match(builder)?.length ?? 0) + (source.match(rawSql)?.length ?? 0);
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

describe("the block type list has one source of truth", () => {
  /**
   * The 19 names live twice: in BLOCK_SPECS here, and in the CHECK constraint
   * on the blocks table in src/db/schema.ts, which this ticket does not own.
   * Nothing makes them agree, so a type added to one and not the other fails
   * at INSERT time in production rather than at build time. This pins them.
   */
  it("BLOCK_SPECS matches the blocks table CHECK constraint", async () => {
    const { createApiDb, teardownApiDb } = await import("./helpers");
    const { BLOCK_TYPES } = await import("@/lib/validation/blocks");
    const sqlite = createApiDb();
    try {
      const ddl = (
        sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='blocks'").get() as { sql: string }
      ).sql;
      const inCheck = [...ddl.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
      expect(new Set(inCheck)).toEqual(new Set(BLOCK_TYPES));
      expect(BLOCK_TYPES).toHaveLength(19);
    } finally {
      teardownApiDb();
    }
  });
});

describe("the write detector sees every shape a write can take", () => {
  /**
   * Each entry is a real way to write the blocks table in this codebase's
   * idiom. A detector that misses one is a gate that can be walked around,
   * which is what happened: the drizzle-interpolation row below was a live,
   * undetected write from a second module.
   */
  const WRITE_SHAPES: Array<[string, string]> = [
    ["builder, bare table", "db.update(blocks).set({})"],
    ["builder, namespaced", "db.update(schema.blocks).set({})"],
    ["builder, insert", "db.insert(blocks).values({})"],
    ["builder, delete", "db.delete(blocks).where(x)"],
    ["builder, whitespace", "db.update( blocks ).set({})"],
    ["raw, unquoted", "db.run(sql`UPDATE blocks SET text = 1`)"],
    ["raw, quoted", 'db.run(sql`UPDATE "blocks" SET text = 1`)'],
    ["raw, drizzle interpolation", "db.run(sql`UPDATE ${blocks} SET text = 1`)"],
    ["raw, schema-qualified", "db.run(sql`UPDATE main.blocks SET text = 1`)"],
    ["raw, INSERT OR REPLACE", "db.run(sql`INSERT OR REPLACE INTO blocks VALUES (1)`)"],
    ["raw, REPLACE INTO", "db.run(sql`REPLACE INTO blocks VALUES (1)`)"],
    ["raw, UPDATE OR IGNORE", "db.run(sql`UPDATE OR IGNORE blocks SET text = 1`)"],
    ["raw, DELETE FROM", "db.run(sql`DELETE FROM blocks WHERE id = 1`)"],
    ["raw, INSERT INTO", "db.run(sql`INSERT INTO blocks VALUES (1)`)"],
    ["better-sqlite3 direct", 'client.prepare("UPDATE blocks SET text = ?").run(1)'],
    ["exec script", 'client.exec("UPDATE blocks SET text = 1;")'],
  ];

  it.each(WRITE_SHAPES)("detects: %s", (_label, source) => {
    expect(rawWrites(source, "blocks")).toBeGreaterThan(0);
  });

  it("does not fire on prose or on a neighbouring table", () => {
    expect(rawWrites("// we update blocks here, eventually", "blocks")).toBe(0);
    expect(rawWrites("db.update(blocks_audit).set({})", "blocks")).toBe(0);
    expect(rawWrites("db.run(sql`UPDATE blocks_view SET x = 1`)", "blocks")).toBe(0);
  });
});
