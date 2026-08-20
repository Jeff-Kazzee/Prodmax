/**
 * Shared fixtures for the T-007 docs suites.
 *
 * Named `pages-harness` so it sits inside T-007's owns glob
 * (tests/api/{pages,blocks,search}*). The blocks and search suites import it
 * too; splitting it per suite would mean three copies of the same signup.
 */
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as login } from "@/pages/api/auth/login";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { apiReq, bodyOf, cookieFor, insertUser, sessionTokenFrom } from "./helpers";

export interface DocsEnv {
  wsId: string;
  teamId: string;
  cookie: string;
  userId: string;
}

let seq = 0;

/** A workspace with an owner signed in. Each call gets a fresh email + slug. */
export async function docsEnv(): Promise<DocsEnv> {
  seq += 1;
  const email = `docs${seq}@x.com`;
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "Docs", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const userId = (await bodyOf(res)).user.id as string;
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Docs Ws", slug: `docs-ws-${seq}` }, test: true }),
  });
  const ws = await bodyOf(wsRes);
  return { wsId: ws.workspace.id as string, teamId: ws.defaultTeamId as string, cookie, userId };
}

/** Add a member with `role` to `wsId` and sign them in. */
export async function addActor(
  sqlite: Database.Database,
  wsId: string,
  key: string,
  role: string,
): Promise<{ userId: string; cookie: string }> {
  const email = `${key}-${wsId.slice(0, 6)}@x.com`;
  const user = insertUser(sqlite, { email, name: key });
  sqlite
    .prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)")
    .run(`${key}-${wsId.slice(0, 6)}-m`, wsId, user.id, role, Date.now());
  const res = await login({
    request: apiReq("POST", "/auth/login", { body: { email, password: "password123" } }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${key}: ${res.status}`);
  return { userId: user.id, cookie: cookieFor(sessionTokenFrom(res)) };
}

export interface StatementLog<T> {
  result: T;
  sql: string[];
}

/**
 * Every SQL statement executed on `sqlite` while `fn` runs.
 *
 * Tests hold the raw better-sqlite3 handle from `createApiDb()`; handlers hold
 * the Drizzle wrapper installed by `setDbOverride`. They are the same
 * connection object, so patching `prepare` here observes handler traffic.
 *
 * Measured against this repo's drizzle-orm before relying on it:
 *   - two identical selects call `prepare` twice, so Drizzle does not cache
 *     and the prepare count equals the execution count;
 *   - `db.transaction()` does not route BEGIN/COMMIT through the public
 *     `prepare`, so wrapping code in a transaction does not change the count.
 *
 * `exec` is patched alongside `prepare` because a raw multi-statement exec
 * would otherwise be invisible, and invisible is what a regression wants.
 *
 * Not safe under concurrent tests: the patch is global to the handle. The
 * docs suites run sequentially, which is vitest's default within a file.
 */
export async function recordStatements<T>(
  sqlite: Database.Database,
  fn: () => Promise<T>,
): Promise<StatementLog<T>> {
  const sql: string[] = [];
  const prep = sqlite.prepare.bind(sqlite);
  const exec = sqlite.exec.bind(sqlite);
  sqlite.prepare = ((q: string) => {
    sql.push(q);
    return prep(q);
  }) as typeof sqlite.prepare;
  sqlite.exec = ((q: string) => {
    sql.push(q);
    return exec(q);
  }) as typeof sqlite.exec;
  try {
    return { result: await fn(), sql };
  } finally {
    sqlite.prepare = prep;
    sqlite.exec = exec;
  }
}

/**
 * Statements that read or write `table`.
 *
 * Matching on the table name rather than counting a hard total is deliberate:
 * a fixed total becomes a suppression list that someone raises when a guard
 * changes, which is how this class of check dies.
 */
export function touching(table: string, log: readonly string[]): string[] {
  const re = new RegExp(`\\b(from|join|into|update)\\s+"?${table}"?\\b`, "i");
  return log.filter((s) => re.test(s));
}

/** EXPLAIN QUERY PLAN detail lines for one recorded statement. */
export function explain(sqlite: Database.Database, source: string): string[] {
  if (!/^\s*(select|insert|update|delete)/i.test(source.trim())) return [];
  const params = new Array((source.match(/\?/g) ?? []).length).fill(null);
  return (sqlite.prepare(`EXPLAIN QUERY PLAN ${source}`).all(...params) as Array<{ detail: string }>).map(
    (r) => r.detail,
  );
}

/** A minimal valid richText run. */
export function rt(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}
