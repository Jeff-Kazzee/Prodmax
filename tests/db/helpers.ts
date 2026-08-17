/**
 * DB test helpers (M1a): every test gets a fresh temp SQLite file with the
 * full Drizzle migration set + FTS5 schema applied, torn down afterwards.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { applyFtsSchema } from "@/db/fts";
import * as schema from "@/db/schema";

export type TestSqlite = Database.Database;

export interface TestDb {
  sqlite: TestSqlite;
  file: string;
}

const cleanups: Array<() => void> = [];

/** Fresh tmp DB + migrations + FTS schema; registers cleanup. */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(path.join(tmpdir(), "prodmax-test-"));
  const file = path.join(dir, "test.db");
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  const db = drizzle(sqlite, { schema });
  // cwd-relative (vitest runs from the project root); avoids the Vite
  // `new URL(literal, import.meta.url)` rewrite, which yields a non-file URL.
  const migrationsFolder = path.resolve(process.cwd(), "src", "db", "migrations");
  migrate(db, { migrationsFolder });
  applyFtsSchema(sqlite);

  cleanups.push(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { sqlite, file };
}

/** Close and delete every DB handed out by createTestDb (afterEach hook). */
export function cleanupTestDbs(): void {
  for (const cleanup of cleanups.splice(0)) cleanup();
}

/** Tiny raw insert helper (tests speak SQL columns, not Drizzle). */
export function insertRow(
  sqlite: TestSqlite,
  table: string,
  row: Record<string, unknown>,
): void {
  const keys = Object.keys(row);
  sqlite
    .prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
    .run(...keys.map((k) => row[k]));
}

export interface Fixtures {
  userId: string;
  wsId: string;
  teamId: string;
  stateId: string;
}

/** Minimal FK-complete fixtures: one user, workspace, PRO team, Todo state. */
export function createFixtures(sqlite: TestSqlite): Fixtures {
  const now = Date.now();
  insertRow(sqlite, "users", {
    id: "user-1",
    email: "t@example.com",
    password_hash: "x",
    name: "Tester",
    avatar_seed: "t",
    created_at: now,
    updated_at: now,
  });
  insertRow(sqlite, "workspaces", {
    id: "ws-1",
    name: "One",
    slug: "one",
    timezone: "UTC",
    settings: "{}",
    created_at: now,
    updated_at: now,
  });
  insertRow(sqlite, "teams", {
    id: "team-1",
    workspace_id: "ws-1",
    key: "PRO",
    name: "Product",
    position: "a",
    next_cycle_number: 1,
    created_at: now,
    updated_at: now,
  });
  insertRow(sqlite, "states", {
    id: "state-1",
    team_id: "team-1",
    name: "Todo",
    category: "unstarted",
    position: "a",
  });
  return { userId: "user-1", wsId: "ws-1", teamId: "team-1", stateId: "state-1" };
}

/** Insert an issue row (FTS trigger fires automatically). */
export function insertIssue(
  sqlite: TestSqlite,
  fx: Fixtures,
  overrides: Record<string, unknown>,
): string {
  const id = (overrides.id as string | undefined) ?? `issue-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  const { id: _ignored, ...rest } = overrides;
  void _ignored;
  insertRow(sqlite, "issues", {
    workspace_id: fx.wsId,
    team_id: fx.teamId,
    title: "Untitled",
    description_md: "",
    state_id: fx.stateId,
    priority: 0,
    assignee_id: null,
    creator_id: fx.userId,
    position: "a",
    version: 1,
    created_at: now,
    updated_at: now,
    ...rest,
    id,
    number: rest.number ?? 1,
    identifier: rest.identifier ?? `PRO-${rest.number ?? 1}`,
  });
  return id;
}
