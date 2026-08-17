// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceScopeError, assertWorkspaceScope } from "@/db/scope";
import { cleanupTestDbs, createFixtures, createTestDb, insertIssue, insertRow } from "./helpers";

afterEach(cleanupTestDbs);

describe("workspace scope guard (§7)", () => {
  it("rejects cross-workspace references with FORBIDDEN", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    const now = Date.now();
    insertRow(sqlite, "workspaces", {
      id: "ws-2", name: "Two", slug: "two", timezone: "UTC", settings: "{}",
      created_at: now, updated_at: now,
    });
    const issueId = insertIssue(sqlite, fx, { title: "Scoped" });

    expect(() => assertWorkspaceScope(sqlite, "issues", issueId, fx.wsId)).not.toThrow();
    try {
      assertWorkspaceScope(sqlite, "issues", issueId, "ws-2");
      expect.unreachable("must throw");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkspaceScopeError);
      expect((err as WorkspaceScopeError).code).toBe("FORBIDDEN");
    }
  });

  it("reports missing rows as NOT_FOUND, not FORBIDDEN", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    try {
      assertWorkspaceScope(sqlite, "issues", "does-not-exist", fx.wsId);
      expect.unreachable("must throw");
    } catch (err) {
      expect(err).toBeInstanceOf(WorkspaceScopeError);
      expect((err as WorkspaceScopeError).code).toBe("NOT_FOUND");
    }
  });
});
