/**
 * Workspace-scope guard (architecture §7): every read/write of a
 * workspace-scoped row must be checked against the workspace resolved
 * server-side (session or API key) — never from client payload alone.
 *
 * This is the db-level backstop used by tests and (later) the service
 * layer's `scopedQuery` helper. It deliberately rejects rather than
 * filters, so a cross-workspace reference fails loudly.
 */
import type Database from "better-sqlite3";

export type SqliteDb = Database.Database;

/** Tables that carry a workspace_id scoping predicate (§7). */
export const SCOPED_TABLES = [
  "workspaces",
  "workspace_members",
  "invites",
  "teams",
  "team_members",
  "label_groups",
  "labels",
  "issues",
  "issue_relations",
  "issue_history",
  "issue_description_versions",
  "attachments",
  "projects",
  "project_updates",
  "milestones",
  "cycles",
  "views",
  "pages",
  "blocks",
  "templates",
  "comments",
  "mentions",
  "notifications",
  "notification_prefs",
  "activity_events",
  "event_log",
  "presence_sessions",
  "api_keys",
  "webhooks",
  "ai_runs",
  "triage_feedback",
  "issue_redirects",
] as const;

export type ScopedTable = (typeof SCOPED_TABLES)[number];

export type ScopeErrorCode = "NOT_FOUND" | "FORBIDDEN";

export class WorkspaceScopeError extends Error {
  readonly code: ScopeErrorCode;
  constructor(code: ScopeErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceScopeError";
    this.code = code;
  }
}

/**
 * Assert that the row `id` in `table` belongs to `workspaceId`.
 * Throws WorkspaceScopeError(NOT_FOUND) when the row is missing and
 * WorkspaceScopeError(FORBIDDEN) when it belongs to another workspace.
 */
export function assertWorkspaceScope(
  sqlite: SqliteDb,
  table: ScopedTable,
  id: string,
  workspaceId: string,
): void {
  const row = sqlite
    .prepare(`SELECT workspace_id AS ws FROM ${table} WHERE id = ?`)
    .get(id) as { ws: string } | undefined;
  if (row === undefined) {
    throw new WorkspaceScopeError("NOT_FOUND", `${table} ${id} not found`);
  }
  if (row.ws !== workspaceId) {
    throw new WorkspaceScopeError(
      "FORBIDDEN",
      `${table} ${id} belongs to a different workspace`,
    );
  }
}
