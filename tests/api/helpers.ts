/**
 * API test helpers (M1b): fresh DB per test wired into handlers via
 * setDbOverride, Request factories, and cookie extraction. Handlers are
 * called directly with real Request objects (no Astro server needed).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { applyFtsSchema } from "@/db/fts";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { setDbOverride } from "@/lib/api/db";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { hashPassword } from "@/lib/auth/password";

export const BASE = "http://localhost/api";

const dbs: Array<{ sqlite: Database.Database; dir: string }> = [];

/** Fresh migrated DB bound to all API handlers; returns the raw handle. */
export function createApiDb(): Database.Database {
  const dir = mkdtempSync(path.join(tmpdir(), "prodmax-api-"));
  const file = path.join(dir, "test.db");
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const db: Db = drizzle(sqlite, { schema });
  const migrationsFolder = path.resolve(process.cwd(), "src", "db", "migrations");
  migrate(db, { migrationsFolder });
  applyFtsSchema(sqlite);
  setDbOverride(db);
  dbs.push({ sqlite, dir });
  return sqlite;
}

/** Call in afterEach: unbind + close + delete every test DB. */
export function teardownApiDb(): void {
  setDbOverride(undefined);
  resetRateLimits();
  for (const { sqlite, dir } of dbs.splice(0)) {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface ReqOptions {
  body?: unknown;
  cookie?: string | null;
  origin?: string;
  test?: boolean;
}

/** Build a Request aimed at an API route, JSON body + headers included. */
export function apiReq(method: string, path: string, opts: ReqOptions = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  if (opts.test) headers["x-prodmax-test"] = "1";
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** Extract the raw session token from a response's Set-Cookie. */
export function sessionTokenFrom(res: Response): string {
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  for (const c of cookies) {
    const m = /prodmax_session=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  throw new Error("no session cookie in response");
}

/** Cookie header value for a token captured via sessionTokenFrom. */
export function cookieFor(token: string): string {
  return `prodmax_session=${token}`;
}

/** Insert a user row directly (password "password123" unless given). */
export function insertUser(
  sqlite: Database.Database,
  overrides: { id?: string; email?: string; name?: string; password?: string } = {},
): { id: string; email: string; password: string } {
  const id = overrides.id ?? `u-${Math.random().toString(36).slice(2, 10)}`;
  const email = overrides.email ?? `${id}@example.com`;
  const password = overrides.password ?? "password123";
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, avatar_seed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, email, hashPassword(password), overrides.name ?? "Test User", id, now, now);
  return { id, email, password };
}

/** Convenience: JSON body of a Response. */
export async function bodyOf(res: Response): Promise<any> {
  return res.json();
}
