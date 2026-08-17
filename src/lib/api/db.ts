/**
 * DB access for API handlers (M1b).
 *
 * Production: the shared singleton from src/db/client.ts. Tests: an
 * override injected via `setDbOverride` so handlers exercised directly
 * (Request objects, no Astro runtime) run against a throwaway DB.
 */
import { getDb, type Db } from "@/db/client";

let override: Db | undefined;

/** Point API handlers at a specific database (tests only). */
export function setDbOverride(db: Db | undefined): void {
  override = db;
}

/** The database every M1b handler must use. */
export function currentDb(): Db {
  return override ?? getDb();
}
