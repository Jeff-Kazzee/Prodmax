// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { seedDemo } from "../../scripts/seed";
import { verifyPassword } from "@/lib/auth/password";
import { ftsRowCount, searchWorkspace } from "@/db/fts";
import { cleanupTestDbs, createTestDb } from "./helpers";

afterEach(cleanupTestDbs);

function seed(): ReturnType<typeof createTestDb>["sqlite"] {
  const { sqlite } = createTestDb();
  seedDemo(sqlite);
  return sqlite;
}

function one(sqlite: ReturnType<typeof seed>, sql: string, ...params: unknown[]): number {
  return (sqlite.prepare(sql).get(...params) as { n: number }).n;
}

describe("demo-bench seed (ux-spec §12)", () => {
  it("produces the specified counts", () => {
    const sqlite = seed();
    expect(one(sqlite, "SELECT count(*) AS n FROM issues")).toBe(24);
    expect(one(sqlite, "SELECT count(*) AS n FROM users")).toBe(4);
    expect(one(sqlite, "SELECT count(*) AS n FROM pages")).toBe(4);
    expect(one(sqlite, "SELECT count(*) AS n FROM labels")).toBe(10);
    expect(one(sqlite, "SELECT count(*) AS n FROM views")).toBe(3);
    expect(one(sqlite, "SELECT count(*) AS n FROM notifications")).toBe(5);
    expect(one(sqlite, "SELECT count(*) AS n FROM projects")).toBe(2);
    expect(one(sqlite, "SELECT count(*) AS n FROM milestones")).toBe(3);
    expect(one(sqlite, "SELECT count(*) AS n FROM states")).toBe(7);
    expect(one(sqlite, "SELECT count(*) AS n FROM blocks")).toBeGreaterThan(10);
    expect(one(sqlite, "SELECT count(*) AS n FROM activity_events")).toBeGreaterThan(0);
    expect(one(sqlite, "SELECT count(*) AS n FROM cycles WHERE status = 'active'")).toBe(1);
    expect(one(sqlite, "SELECT count(*) AS n FROM cycles WHERE status = 'completed'")).toBe(1);
    // One active cycle spanning today.
    const cycle = sqlite
      .prepare("SELECT starts_at AS s, ends_at AS e FROM cycles WHERE status = 'active'")
      .get() as { s: number; e: number };
    const now = Date.now();
    expect(cycle.s).toBeLessThan(now);
    expect(cycle.e).toBeGreaterThan(now);
  });

  it("carries the specified structure: relations, sub-issues, ids, FTS, credentials", () => {
    const sqlite = seed();
    const wsId = (sqlite.prepare("SELECT id AS id FROM workspaces WHERE slug = 'acme'").get() as { id: string }).id;

    // Blocked pair + duplicate pair.
    expect(one(sqlite, "SELECT count(*) AS n FROM issue_relations WHERE type = 'blocked_by'")).toBe(1);
    expect(one(sqlite, "SELECT count(*) AS n FROM issue_relations WHERE type = 'duplicate'")).toBe(1);
    // Sub-issues.
    expect(one(sqlite, "SELECT count(*) AS n FROM issues WHERE parent_id IS NOT NULL")).toBe(3);

    // Identifiers are sequential, unique, PRO-keyed.
    const numbers = (
      sqlite.prepare("SELECT number AS n FROM issues ORDER BY number").all() as Array<{ n: number }>
    ).map((r) => r.n);
    expect(numbers).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    const identifiers = (
      sqlite.prepare("SELECT identifier AS i FROM issues ORDER BY number").all() as Array<{ i: string }>
    ).map((r) => r.i);
    expect(new Set(identifiers).size).toBe(24);
    expect(identifiers[0]).toBe("PRO-1");
    expect(identifiers[23]).toBe("PRO-24");

    // Mixed states, priorities, assignees, estimates.
    expect(one(sqlite, "SELECT count(*) AS n FROM issues WHERE completed_at IS NOT NULL")).toBe(3);
    expect(one(sqlite, "SELECT count(*) AS n FROM issues WHERE assignee_id IS NULL")).toBe(3);
    expect(one(sqlite, "SELECT count(*) AS n FROM issues WHERE estimate IS NULL")).toBe(0);
    // count(DISTINCT) skips NULL: 3 distinct human assignees + 3 unassigned.
    expect(one(sqlite, "SELECT count(DISTINCT assignee_id) AS n FROM issues")).toBe(3);

    // Roles: owner + admin + 2 members.
    const roles = (
      sqlite
        .prepare(
          "SELECT m.role AS r FROM workspace_members m JOIN users u ON u.id = m.user_id ORDER BY u.email",
        )
        .all() as Array<{ r: string }>
    ).map((r) => r.r);
    expect(roles).toEqual(["owner", "admin", "member", "member"]);

    // Docs: 1 parent with 2 children + 1 root page; block variety.
    expect(one(sqlite, "SELECT count(*) AS n FROM pages WHERE parent_id IS NOT NULL")).toBe(2);
    expect(one(sqlite, "SELECT count(*) AS n FROM pages WHERE depth = 1")).toBe(2);
    for (const type of ["heading_1", "heading_2", "todo", "callout", "code", "issue_view"]) {
      expect(one(sqlite, "SELECT count(*) AS n FROM blocks WHERE type = ?", type)).toBeGreaterThan(0);
    }

    // FTS index rebuilt: 24 issues + 4 pages + 2 projects.
    expect(ftsRowCount(sqlite)).toBe(30);

    // The §12 step-7 aha moment: "payment" surfaces the latency incident first.
    const hits = searchWorkspace(sqlite, { workspaceId: wsId, query: "payment" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ entityType: "issue", title: "Payment latency spike on checkout" });

    // Every demo user verifies with the documented password.
    const hashes = sqlite.prepare("SELECT password_hash AS h FROM users").all() as Array<{ h: string }>;
    expect(hashes).toHaveLength(4);
    for (const { h } of hashes) {
      expect(verifyPassword("prodmax-demo", h)).toBe(true);
      expect(verifyPassword("wrong-password", h)).toBe(false);
    }
  });

  it("reseeding the same database is a clean wipe + replace", () => {
    const { sqlite } = createTestDb();
    seedDemo(sqlite);
    const firstId = (sqlite.prepare("SELECT id AS id FROM workspaces").get() as { id: string }).id;
    seedDemo(sqlite);
    expect(one(sqlite, "SELECT count(*) AS n FROM issues")).toBe(24);
    expect(one(sqlite, "SELECT count(*) AS n FROM workspaces")).toBe(1);
    expect((sqlite.prepare("SELECT id AS id FROM workspaces").get() as { id: string }).id).not.toBe(firstId);
    expect(one(sqlite, "SELECT count(*) AS n FROM activity_events")).toBe(8);
  });
});

describe("seeded blocks obey the §2.6 props contract (T-034)", () => {
  /**
   * The seed used to put block content in the `text` column and a
   * per-type-invented shape in `props`, so every spec-conformant reader found
   * the demo pages empty. Parsing each row against the real schemas is what
   * stops that drifting back: the assertion is the contract itself, not a
   * transcription of it.
   */
  it("every block's props parse against the shipped per-type schema", async () => {
    const { BLOCK_SPECS, isBlockType } = await import("@/lib/validation/blocks");
    const sqlite = seed();
    const rows = sqlite.prepare("SELECT id, type, props FROM blocks").all() as Array<{
      id: string;
      type: string;
      props: string;
    }>;
    expect(rows.length).toBeGreaterThan(20);

    const failures: string[] = [];
    for (const row of rows) {
      if (!isBlockType(row.type)) {
        failures.push(`${row.id}: unknown type ${row.type}`);
        continue;
      }
      const parsed = BLOCK_SPECS[row.type].props.safeParse(JSON.parse(row.props));
      if (!parsed.success) {
        failures.push(`${row.id} (${row.type}): ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("derives the text column from props with the service's own extractor", async () => {
    const { richTextToPlain } = await import("@/lib/validation/blocks-richtext");
    const sqlite = seed();
    const rows = sqlite.prepare("SELECT id, type, props, text FROM blocks").all() as Array<{
      id: string;
      type: string;
      props: string;
      text: string;
    }>;

    const mismatched: string[] = [];
    for (const row of rows) {
      const props = JSON.parse(row.props) as { text?: unknown; code?: unknown };
      const expected =
        row.type === "code"
          ? String(props.code ?? "")
          : Array.isArray(props.text)
            ? richTextToPlain(props.text as Parameters<typeof richTextToPlain>[0])
            : "";
      if (row.text !== expected) mismatched.push(`${row.id} (${row.type}): ${JSON.stringify(row.text)} != ${JSON.stringify(expected)}`);
    }
    expect(mismatched).toEqual([]);
    // A seed that wrote "" everywhere would satisfy the loop above.
    expect(rows.filter((r) => r.text.length > 0).length).toBeGreaterThan(15);
  });

  it("points the issue_view block at a real saved view, not an issue", () => {
    const sqlite = seed();
    const row = sqlite.prepare("SELECT props FROM blocks WHERE type = 'issue_view'").get() as { props: string };
    const props = JSON.parse(row.props) as { viewId?: string; issueId?: string };
    // ED-09 embeds a saved view. The old seed carried {issueId}, which no
    // consumer reads, so the one embed on the demo bench could not render.
    expect(props.issueId).toBeUndefined();
    expect(typeof props.viewId).toBe("string");
    expect((sqlite.prepare("SELECT count(*) AS n FROM views WHERE id = ?").get(props.viewId) as { n: number }).n).toBe(1);
  });

  it("keeps the page's FTS body findable through the block text", () => {
    const sqlite = seed();
    const wsId = (sqlite.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: string }).id;
    // A word that exists only inside a block, never in a page title.
    const hits = searchWorkspace(sqlite, { workspaceId: wsId, query: "rollbacks", entityTypes: ["page"] });
    expect(hits.length).toBeGreaterThan(0);
  });
});
