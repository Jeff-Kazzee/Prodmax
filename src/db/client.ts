import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | undefined;

/**
 * Lazy singleton connection to `data/prodmax.db`.
 * Pragmas are binding (architecture §9): WAL, foreign_keys=ON,
 * busy_timeout=5000, synchronous=NORMAL.
 */
export function getDb(): Db {
  if (_db) return _db;

  const dataDir = path.resolve(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(path.join(dataDir, "prodmax.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  _db = drizzle(sqlite, { schema });
  return _db;
}
