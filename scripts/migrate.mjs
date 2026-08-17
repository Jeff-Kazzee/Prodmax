// Applies Drizzle migrations to data/prodmax.db.
// Creates data/ if missing and sets the binding pragmas (architecture §9):
// WAL, foreign_keys=ON, busy_timeout=5000, synchronous=NORMAL.
import { mkdirSync } from "node:fs";
import path from "node:path";
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

console.log("migrations applied to data/prodmax.db");
sqlite.close();
