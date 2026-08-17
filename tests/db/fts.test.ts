// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { ftsRowCount, searchWorkspace } from "@/db/fts";
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
