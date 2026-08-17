// @vitest-environment node
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { applyFtsSchema, ftsRowCount } from "@/db/fts";
import * as schema from "@/db/schema";
import { cleanupTestDbs, createFixtures, createTestDb, insertIssue } from "./helpers";

afterEach(cleanupTestDbs);

describe("migrations + FTS schema idempotency", () => {
  it("re-applying migrations and fts.sql does not duplicate triggers or rows", () => {
    const { sqlite } = createTestDb(); // already migrated + FTS applied once
    const fx = createFixtures(sqlite);

    // Apply everything a second (and third) time on the live database.
    const db = drizzle(sqlite, { schema });
    const migrationsFolder = path.resolve(process.cwd(), "src", "db", "migrations");
    for (let i = 0; i < 2; i++) {
      migrate(db, { migrationsFolder });
      applyFtsSchema(sqlite);
    }

    insertIssue(sqlite, fx, { title: "Payment latency spike on checkout" });
    insertIssue(sqlite, fx, { number: 2, identifier: "PRO-2", title: "Second issue" });

    // Exactly one FTS row per issue — duplicated triggers would insert more.
    expect(ftsRowCount(sqlite)).toBe(2);
    // Trigger count is stable (3 per table × 5 tables, no stacking).
    const triggers = sqlite
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'fts_%'")
      .get() as { n: number };
    expect(triggers.n).toBe(15);
  });
});
