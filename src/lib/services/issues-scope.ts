import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { issueRedirects, issues, teamMembers } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";

export type IssueRow = typeof issues.$inferSelect;

export function guestTeamIds(userId: string): string[] {
  return currentDb()
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .all()
    .map((r) => r.teamId);
}

/** Workspace-scoped live issues; guests are limited to their teams (§7). */
export function issueScope(wsId: string, role: Role, userId: string): SQL {
  const base = and(eq(issues.workspaceId, wsId), isNull(issues.deletedAt));
  if (role !== "guest") return base as SQL;
  const teams = guestTeamIds(userId);
  if (teams.length === 0) return and(base, eq(issues.id, "__none__")) as SQL;
  return and(base, inArray(issues.teamId, teams)) as SQL;
}

export function assertIssueTeamAccess(role: Role, userId: string, teamId: string): void {
  if (role !== "guest") return;
  if (!guestTeamIds(userId).includes(teamId)) {
    throw new HttpError("NOT_FOUND", "Issue not found");
  }
}

export function loadIssueInWorkspace(wsId: string, idOrIdentifier: string): IssueRow {
  const db = currentDb();
  const byId = db
    .select()
    .from(issues)
    .where(and(eq(issues.workspaceId, wsId), eq(issues.id, idOrIdentifier)))
    .get();
  if (byId) return byId;

  const byIdent = db
    .select()
    .from(issues)
    .where(and(eq(issues.workspaceId, wsId), eq(issues.identifier, idOrIdentifier)))
    .get();
  if (byIdent) return byIdent;

  const redirect = db
    .select()
    .from(issueRedirects)
    .where(and(eq(issueRedirects.workspaceId, wsId), eq(issueRedirects.oldIdentifier, idOrIdentifier)))
    .get();
  if (redirect) {
    const moved = db.select().from(issues).where(eq(issues.id, redirect.issueId)).get();
    if (moved && moved.workspaceId === wsId) return moved;
  }
  throw new HttpError("NOT_FOUND", "Issue not found");
}

export function requireLiveIssue(wsId: string, idOrIdentifier: string, role: Role, userId: string): IssueRow {
  const issue = loadIssueInWorkspace(wsId, idOrIdentifier);
  if (issue.deletedAt) throw new HttpError("NOT_FOUND", "Issue not found");
  assertIssueTeamAccess(role, userId, issue.teamId);
  return issue;
}
