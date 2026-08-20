// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { applyFtsSchema, ftsRowCount, reindexFts, searchWorkspace } from "@/db/fts";
import { cleanupTestDbs, createFixtures, createTestDb, insertIssue, insertRow } from "./helpers";

afterEach(cleanupTestDbs);

describe("full-text search (§2.10)", () => {
  it("ranks a title match above a body match and drops non-matches", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const inTitle = insertIssue(sqlite, fx, {
      title: "Payment latency spike on checkout",
      description_md: "p95 jumped to 2.8s during the incident window.",
      updated_at: Date.now(),
    });
    const inBody = insertIssue(sqlite, fx, {
      number: 2,
      identifier: "PRO-2",
      title: "Refund flow confuses customers",
      description_md: "payment retries send a second receipt",
      updated_at: Date.now(),
    });
    insertIssue(sqlite, fx, {
      number: 3,
      identifier: "PRO-3",
      title: "Dark theme contrast audit",
      description_md: "no relevant terms here",
      updated_at: Date.now(),
    });

    const hits = searchWorkspace(sqlite, { workspaceId: fx.wsId, query: "payment" });
    expect(hits.length).toBe(2);
    expect(hits[0]).toMatchObject({ entityType: "issue", entityId: inTitle });
    expect(hits[1]).toMatchObject({ entityType: "issue", entityId: inBody });
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits.some((h) => h.title === "Dark theme contrast audit")).toBe(false);
  });

  it("never returns rows from another workspace", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const now = Date.now();
    insertRow(sqlite, "workspaces", {
      id: "ws-2", name: "Two", slug: "two", timezone: "UTC", settings: "{}",
      created_at: now, updated_at: now,
    });
    const mine = insertIssue(sqlite, fx, { title: "Payment latency spike on checkout" });
    const theirs = insertIssue(sqlite, fx, {
      workspace_id: "ws-2",
      number: 1,
      identifier: "PRO-1",
      title: "Payment issue in another workspace",
    });

    const inOne = searchWorkspace(sqlite, { workspaceId: fx.wsId, query: "payment" });
    const inTwo = searchWorkspace(sqlite, { workspaceId: "ws-2", query: "payment" });

    expect(inOne.map((h) => h.entityId)).toEqual([mine]);
    expect(inTwo.map((h) => h.entityId)).toEqual([theirs]);
  });

  it("trigger sync keeps one FTS row per issue across updates", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const issueId = insertIssue(sqlite, fx, { title: "Original title" });
    expect(ftsRowCount(sqlite)).toBe(1);

    sqlite
      .prepare("UPDATE issues SET title = ?, updated_at = ? WHERE id = ?")
      .run("Renamed payment title", Date.now(), issueId);

    expect(ftsRowCount(sqlite)).toBe(1);
    const hits = searchWorkspace(sqlite, { workspaceId: fx.wsId, query: "payment" });
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Renamed payment title");
  });
});

describe("the index holds a row exactly while its entity is live (T-035)", () => {
  /**
   * The update triggers fired on `deleted_at` and then re-INSERTed the row
   * unconditionally, so trashing an entity left it searchable. Pages have a
   * 30-day trash window, so that was a month of deleted content in every
   * search rather than a brief inconsistency.
   */
  const now = Date.now();

  type Sqlite = ReturnType<typeof createTestDb>["sqlite"];
  type Fx = ReturnType<typeof createFixtures>;

  function seedPage(sqlite: Sqlite, fx: Fx, id = "p1"): string {
    insertRow(sqlite, "pages", {
      id,
      workspace_id: fx.wsId,
      path: `/${id}`,
      title: "Runbook for payment incidents",
      creator_id: "user-1",
      position: "a0",
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  function seedBlock(sqlite: Sqlite, fx: Fx, pageId: string, text: string): void {
    insertRow(sqlite, "blocks", {
      id: "b1",
      workspace_id: fx.wsId,
      page_id: pageId,
      type: "paragraph",
      props: "{}",
      position: "a0",
      text,
      created_by: "user-1",
      created_at: now,
      updated_at: now,
    });
  }

  const keys = (sqlite: Sqlite, wsId: string, q: string): string[] =>
    searchWorkspace(sqlite, { workspaceId: wsId, query: q })
      .map((h) => `${h.entityType}:${h.entityId}`)
      .sort();

  it("drops a soft-deleted page, and brings it back on restore", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const page = seedPage(sqlite, fx);
    seedBlock(sqlite, fx, page, "escalation path for checkout");
    expect(keys(sqlite, fx.wsId, "payment")).toEqual(["page:p1"]);

    sqlite.prepare("UPDATE pages SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now + 1, page);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);

    // Restore is the other half, and it is a separate assertion on purpose: a
    // trigger that only ever deleted would satisfy the line above while
    // silently breaking every page rename.
    sqlite.prepare("UPDATE pages SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(now + 2, page);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual(["page:p1"]);
    // The body came back too, not only the title.
    expect(keys(sqlite, fx.wsId, "escalation")).toEqual(["page:p1"]);
  });

  it("drops a soft-deleted issue and a soft-deleted project", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const issue = insertIssue(sqlite, fx, { title: "Payment latency spike", updated_at: now });
    insertRow(sqlite, "projects", {
      id: "pr1",
      workspace_id: fx.wsId,
      name: "Payment reliability",
      position: "a0",
      created_at: now,
      updated_at: now,
    });
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([`issue:${issue}`, "project:pr1"].sort());

    sqlite.prepare("UPDATE issues SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now + 1, issue);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual(["project:pr1"]);

    sqlite.prepare("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now + 1, "pr1");
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);
  });

  it("does not let a comment resurrect a trashed issue", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const issue = insertIssue(sqlite, fx, { title: "Payment latency spike", updated_at: now });
    insertRow(sqlite, "comments", {
      id: "c1",
      workspace_id: fx.wsId,
      entity_type: "issue",
      entity_id: issue,
      author_id: "user-1",
      body_md: "a note",
      created_at: now,
      updated_at: now,
    });
    sqlite.prepare("UPDATE issues SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now + 1, issue);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);

    // Reachable through the API today: DELETE the issue, then DELETE one of its
    // comments. The comment triggers rebuild their PARENT, so without a
    // liveness predicate that put the dead issue back.
    sqlite.prepare("UPDATE comments SET deleted_at = ? WHERE id = ?").run(now, "c1");
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);
  });

  it("does not let a block edit resurrect a trashed page", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const page = seedPage(sqlite, fx);
    seedBlock(sqlite, fx, page, "escalation path");
    sqlite.prepare("UPDATE pages SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now + 1, page);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);

    sqlite.prepare("UPDATE blocks SET text = ? WHERE id = ?").run("escalation path, revised", "b1");
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);
  });

  it("trashes and restores a whole cohort in one multi-row UPDATE", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    // pages-trash.ts issues exactly one UPDATE across the subtree, so this
    // pins that the per-row trigger fires once per row, not once per statement.
    for (const id of ["r", "c1", "c2"]) seedPage(sqlite, fx, id);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual(["page:c1", "page:c2", "page:r"]);

    sqlite.prepare("UPDATE pages SET deleted_at = ?, updated_at = ? WHERE workspace_id = ?").run(now, now + 1, fx.wsId);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);

    sqlite.prepare("UPDATE pages SET deleted_at = NULL, updated_at = ? WHERE workspace_id = ?").run(now + 2, fx.wsId);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual(["page:c1", "page:c2", "page:r"]);
  });

  it("reindexFts leaves trashed rows out", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const live = seedPage(sqlite, fx, "live");
    const dead = seedPage(sqlite, fx, "dead");
    sqlite.prepare("UPDATE pages SET deleted_at = ? WHERE id = ?").run(now, dead);

    reindexFts(sqlite);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([`page:${live}`]);
  });

  it("prunes rows an older DDL already wrote, and stays idempotent", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const page = seedPage(sqlite, fx);
    // Stand in for a database that trashed a page under the old triggers: put
    // the row straight into the index, with the page already dead.
    sqlite.prepare("UPDATE pages SET deleted_at = ? WHERE id = ?").run(now, page);
    sqlite
      .prepare(
        "INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at) VALUES (?,?,?,?,?,?)",
      )
      .run("Runbook for payment incidents", "", "page", page, fx.wsId, now);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual(["page:p1"]);

    // Swapping the triggers alone does not clean what the old bodies wrote.
    applyFtsSchema(sqlite);
    expect(keys(sqlite, fx.wsId, "payment")).toEqual([]);

    const after = ftsRowCount(sqlite);
    applyFtsSchema(sqlite);
    expect(ftsRowCount(sqlite)).toBe(after);
  });

  it("replaces a trigger body that a previous DDL already installed", () => {
    const { sqlite } = createTestDb();
    // The scenario that matters is an EXISTING database, not a fresh one. On a
    // fresh database CREATE TRIGGER IF NOT EXISTS and DROP+CREATE behave
    // identically, so asserting on a fresh one proves nothing: an earlier
    // version of this test did exactly that and stayed green with the DROPs
    // removed. Install a stand-in for an older body first.
    sqlite.exec("DROP TRIGGER fts_pages_au;");
    sqlite.exec(`
      CREATE TRIGGER fts_pages_au AFTER UPDATE OF title, workspace_id, updated_at, deleted_at ON pages BEGIN
        DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = new.id;
        INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
        SELECT new.title, 'STALE BODY', 'page', new.id, new.workspace_id, new.updated_at;
      END;`);
    expect(
      (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'fts_pages_au'").get() as { sql: string }).sql,
    ).toContain("STALE BODY");

    applyFtsSchema(sqlite);

    const body = (
      sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'fts_pages_au'").get() as { sql: string }
    ).sql;
    expect(body).not.toContain("STALE BODY");
    expect(body).toContain("new.deleted_at IS NULL");
    expect(
      (
        sqlite
          .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'fts_%'")
          .get() as { n: number }
      ).n,
    ).toBe(15);
  });
});
