/**
 * Full-text search (architecture §2.10): unified FTS5 index `search_fts`
 * over issues, pages and projects, bm25-ranked and workspace-scoped.
 *
 * The virtual table + sync triggers are raw SQL (src/db/fts.sql) because
 * Drizzle cannot express FTS5. This module applies that DDL idempotently
 * and exposes the search helper all services must go through.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

export type SqliteDb = Database.Database;

/**
 * Absolute path of the DDL. Under Node (scripts, migrate) import.meta.url is
 * a file:// URL; under bundler/test contexts Vite rewrites the literal
 * `new URL(<string>, import.meta.url)` pattern into a non-file URL, so the
 * base is captured in a variable first and cwd is the fallback.
 */
const MODULE_URL: string = import.meta.url;
const FTS_SQL_PATH = MODULE_URL.startsWith("file:")
  ? fileURLToPath(new URL("./fts.sql", MODULE_URL))
  : path.resolve(process.cwd(), "src", "db", "fts.sql");

let _ddl: string | undefined;

/** The raw FTS5 DDL (CREATE VIRTUAL TABLE IF NOT EXISTS + triggers). */
export function ftsDdl(): string {
  if (_ddl === undefined) _ddl = readFileSync(FTS_SQL_PATH, "utf8");
  return _ddl;
}

/**
 * Idempotently create the FTS virtual table and sync triggers, then drop any
 * index row with no live entity behind it.
 *
 * The prune is not belt-and-braces. Every trigger in fts.sql is dropped and
 * recreated, so an existing database does pick up the new bodies, but the rows
 * the OLD bodies already wrote survive that swap untouched. A page trashed
 * before this fix would stay searchable forever, because nothing updates it
 * again. Observed on a database built from the previous DDL.
 *
 * `NOT EXISTS` rather than `NOT IN`, so the result does not depend on a NOT
 * NULL declared in a file this module does not own.
 */
export function applyFtsSchema(sqlite: SqliteDb): void {
  sqlite.exec(ftsDdl());
  sqlite.exec(`
    DELETE FROM search_fts WHERE entity_type = 'issue' AND NOT EXISTS (
      SELECT 1 FROM issues t WHERE t.id = search_fts.entity_id AND t.deleted_at IS NULL);
    DELETE FROM search_fts WHERE entity_type = 'page' AND NOT EXISTS (
      SELECT 1 FROM pages t WHERE t.id = search_fts.entity_id AND t.deleted_at IS NULL);
    DELETE FROM search_fts WHERE entity_type = 'project' AND NOT EXISTS (
      SELECT 1 FROM projects t WHERE t.id = search_fts.entity_id AND t.deleted_at IS NULL);`);
}

export interface SearchHit {
  entityType: "issue" | "page" | "project";
  entityId: string;
  title: string;
  /** Higher is better (normalized from bm25 + boosts). */
  score: number;
}

export interface SearchOptions {
  workspaceId: string;
  /** Free-text query; each whitespace token becomes a prefix term. */
  query: string;
  entityTypes?: Array<"issue" | "page" | "project">;
  limit?: number;
}

/** Recency-boost window (7 days, §2.10 rank formula). */
const RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Escape a user query into an FTS5 MATCH expression: every whitespace
 * token becomes a quoted prefix term (`"pay"*`). Quotes are stripped so
 * user input can never alter MATCH syntax.
 */
export function buildMatchExpression(query: string): string {
  return query
    .split(/\s+/)
    .map((token) => token.replaceAll('"', "").trim())
    .filter((token) => token.length > 0)
    .map((token) => `"${token}"*`)
    .join(" ");
}

/**
 * Workspace-scoped search. Rank = bm25 (title weighted 10:1) plus an
 * exact-title boost and a recency boost; smaller bm25 is better, so the
 * returned score negates the sum (higher = more relevant).
 */
export function searchWorkspace(sqlite: SqliteDb, opts: SearchOptions): SearchHit[] {
  const match = buildMatchExpression(opts.query);
  if (match.length === 0) return [];

  const types = opts.entityTypes ?? ["issue", "page", "project"];
  const placeholders = types.map(() => "?").join(", ");
  const sql = `
    SELECT entity_type AS entityType, entity_id AS entityId, title,
      bm25(search_fts, 10.0, 1.0)
      + (CASE WHEN title = ? THEN -3.0 ELSE 0.0 END)
      + (CASE WHEN updated_at >= ? THEN -1.5 ELSE 0.0 END) AS rankScore
    FROM search_fts
    WHERE search_fts MATCH ? AND workspace_id = ?
      AND entity_type IN (${placeholders})
    ORDER BY rankScore ASC, updated_at DESC
    LIMIT ?`;

  const rows = sqlite
    .prepare(sql)
    .all(
      opts.query.trim(),
      Date.now() - RECENCY_WINDOW_MS,
      match,
      opts.workspaceId,
      ...types,
      opts.limit ?? 20,
    ) as Array<{ entityType: SearchHit["entityType"]; entityId: string; title: string; rankScore: number }>;

  return rows.map((r) => ({
    entityType: r.entityType,
    entityId: r.entityId,
    title: r.title,
    score: -r.rankScore,
  }));
}

/**
 * Rebuild the index from scratch (disaster recovery, bulk imports).
 *
 * Mirrors the trigger bodies in fts.sql, including their `deleted_at IS NULL`
 * predicate. Keep both in sync: a rebuild that re-adds trashed rows undoes the
 * triggers' work in a single statement.
 */
export function reindexFts(sqlite: SqliteDb): void {
  sqlite.exec("DELETE FROM search_fts;");
  sqlite.exec(`
    INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
    SELECT i.title,
           COALESCE(i.description_md, '') || COALESCE((
             SELECT ' ' || group_concat(c.body_md, ' ') FROM comments c
             WHERE c.entity_type = 'issue' AND c.entity_id = i.id AND c.deleted_at IS NULL
           ), ''),
           'issue', i.id, i.workspace_id, i.updated_at
    FROM issues i WHERE i.deleted_at IS NULL;`);
  sqlite.exec(`
    INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
    SELECT p.title, COALESCE((
      SELECT group_concat(b.text, ' ') FROM blocks b
      WHERE b.page_id = p.id AND b.deleted_at IS NULL
    ), ''), 'page', p.id, p.workspace_id, p.updated_at
    FROM pages p WHERE p.deleted_at IS NULL;`);
  sqlite.exec(`
    INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
    SELECT pr.name, COALESCE(pr.description_md, ''), 'project', pr.id, pr.workspace_id, pr.updated_at
    FROM projects pr WHERE pr.deleted_at IS NULL;`);
}

/** Row count of the FTS index (diagnostics + tests). */
export function ftsRowCount(sqlite: SqliteDb): number {
  return (sqlite.prepare("SELECT count(*) AS n FROM search_fts").get() as { n: number }).n;
}
