// Applies Drizzle migrations to data/prodmax.db.
// Creates data/ if missing and sets the binding pragmas (architecture §9):
// WAL, foreign_keys=ON, busy_timeout=5000, synchronous=NORMAL.
// Also applies src/db/fts.sql (FTS5 virtual table + sync triggers) —
// idempotently, since Drizzle cannot express virtual tables (§2.10).
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dataDir = path.resolve(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "prodmax.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: path.resolve(process.cwd(), "src/db/migrations") });

const ftsSqlPath = fileURLToPath(new URL("../src/db/fts.sql", import.meta.url));
sqlite.exec(readFileSync(ftsSqlPath, "utf8"));

console.log("migrations + FTS schema applied to data/prodmax.db");
sqlite.close();
