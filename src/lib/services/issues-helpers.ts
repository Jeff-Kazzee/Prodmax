import { eq, sql } from "drizzle-orm";
import { cycles, issueLabels, issues, labels, milestones, projects, states, teams } from "@/db/schema";
import { generateKeyBetween } from "@/db/positions";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { IssueRow } from "./issues-scope";

export function requireWsId(request: Request): string {
  const wsId = new URL(request.url).searchParams.get("wsId");
  if (!wsId) throw new HttpError("VALIDATION", "wsId query parameter is required", ["wsId: required"]);
  return wsId;
}

export function expectedVersionOf(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get("expectedVersion");
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError("VALIDATION", "expectedVersion must be a positive integer");
  }
  return n;
}

export function assertExpectedVersion(issue: IssueRow, expected: number | undefined): void {
  if (expected !== undefined && issue.version !== expected) {
    throw new HttpError("CONFLICT", "Version conflict", [`expectedVersion: ${expected}`, `actual: ${issue.version}`]);
  }
}

export function requireTeamInWorkspace(wsId: string, teamId: string): typeof teams.$inferSelect {
  const team = currentDb().select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team || team.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Team not found");
  return team;
}

/**
 * Parenting ids arrive on the request body and the foreign keys only require
 * the row to exist somewhere, so without this a member of one workspace can
 * attach an issue to another workspace's project. The message never says
 * whether the id exists elsewhere.
 */
function rejectParent(kind: string, id: string): never {
  throw new HttpError("VALIDATION", `Not a valid ${kind} for this workspace`, [`${kind}Id: ${id}`]);
}

/** Validate whichever of the three parenting ids the caller actually sent. */
export function assertParentsInWorkspace(
  wsId: string,
  input: { projectId?: string | null; milestoneId?: string | null; cycleId?: string | null },
): void {
  const db = currentDb();
  if (input.projectId) {
    const row = db
      .select({ workspaceId: projects.workspaceId, deletedAt: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get();
    if (!row || row.workspaceId !== wsId || row.deletedAt !== null) rejectParent("project", input.projectId);
  }
  if (input.milestoneId) {
    const row = db
      .select({ workspaceId: milestones.workspaceId, deletedAt: milestones.deletedAt })
      .from(milestones)
      .where(eq(milestones.id, input.milestoneId))
      .get();
    if (!row || row.workspaceId !== wsId || row.deletedAt !== null) rejectParent("milestone", input.milestoneId);
  }
  if (input.cycleId) {
    const row = db
      .select({ workspaceId: cycles.workspaceId })
      .from(cycles)
      .where(eq(cycles.id, input.cycleId))
      .get();
    if (!row || row.workspaceId !== wsId) rejectParent("cycle", input.cycleId);
  }
}

export function requireStateOnTeam(teamId: string, stateId: string): typeof states.$inferSelect {
  const state = currentDb().select().from(states).where(eq(states.id, stateId)).get();
  if (!state || state.teamId !== teamId) throw new HttpError("NOT_FOUND", "State not found");
  return state;
}

export function defaultStateForTeam(team: typeof teams.$inferSelect): typeof states.$inferSelect {
  if (team.defaultStateId) {
    const state = currentDb().select().from(states).where(eq(states.id, team.defaultStateId)).get();
    if (state && state.teamId === team.id) return state;
  }
  const fallback = currentDb().select().from(states).where(eq(states.teamId, team.id)).all()[0];
  if (!fallback) throw new HttpError("VALIDATION", "Team has no workflow states");
  return fallback;
}

export function allocateIdentifier(teamId: string): { number: number; identifier: string } {
  const db = currentDb();
  const team = db.select({ key: teams.key }).from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new HttpError("NOT_FOUND", "Team not found");
  db.run(sql`INSERT OR IGNORE INTO team_counters (team_id, next_number) VALUES (${teamId}, 1)`);
  const row = db.get<{ n: number }>(
    sql`UPDATE team_counters SET next_number = next_number + 1 WHERE team_id = ${teamId} RETURNING next_number - 1 AS n`,
  );
  if (!row) throw new HttpError("CONFLICT", "Could not allocate issue number");
  return { number: row.n, identifier: `${team.key}-${row.n}` };
}

export function nextIssuePosition(teamId: string): string {
  const last = currentDb()
    .select({ position: issues.position })
    .from(issues)
    .where(eq(issues.teamId, teamId))
    .all()
    .map((r) => r.position)
    .sort()
    .at(-1) ?? null;
  return generateKeyBetween(last, null);
}

export function mapStateToTeam(fromStateId: string, targetTeamId: string): string {
  const from = currentDb().select().from(states).where(eq(states.id, fromStateId)).get();
  const dest = currentDb().select().from(states).where(eq(states.teamId, targetTeamId)).all();
  if (dest.length === 0) throw new HttpError("VALIDATION", "Target team has no workflow states");
  if (from) {
    const byName = dest.find((s) => s.name === from.name);
    if (byName) return byName.id;
    const byCat = dest.find((s) => s.category === from.category);
    if (byCat) return byCat.id;
  }
  const team = currentDb().select().from(teams).where(eq(teams.id, targetTeamId)).get();
  if (team?.defaultStateId && dest.some((s) => s.id === team.defaultStateId)) return team.defaultStateId;
  return dest[0].id;
}

export function stateTimestamps(
  prev: IssueRow,
  nextState: typeof states.$inferSelect,
  now: number,
): { startedAt: number | null; completedAt: number | null } {
  let startedAt = prev.startedAt;
  let completedAt = prev.completedAt;
  if (nextState.category === "started" && startedAt === null) startedAt = now;
  if (nextState.category === "completed") completedAt = now;
  else if (nextState.category !== "completed") completedAt = null;
  return { startedAt, completedAt };
}

export function labelIdsOf(issueId: string): string[] {
  return currentDb()
    .select({ labelId: issueLabels.labelId })
    .from(issueLabels)
    .where(eq(issueLabels.issueId, issueId))
    .all()
    .map((r) => r.labelId);
}

export function replaceIssueLabels(wsId: string, issueId: string, labelIds: string[]): void {
  const db = currentDb();
  const unique = [...new Set(labelIds)];
  for (const labelId of unique) {
    const label = db.select().from(labels).where(eq(labels.id, labelId)).get();
    if (!label || label.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Label not found");
  }
  db.delete(issueLabels).where(eq(issueLabels.issueId, issueId)).run();
  for (const labelId of unique) {
    db.insert(issueLabels).values({ issueId, labelId }).run();
  }
}

export function withLabels<T extends IssueRow>(issue: T): T & { labelIds: string[] } {
  return { ...issue, labelIds: labelIdsOf(issue.id) };
}

export function latestIssue(id: string): IssueRow {
  const row = currentDb().select().from(issues).where(eq(issues.id, id)).get();
  if (!row) throw new HttpError("NOT_FOUND", "Issue not found");
  return row;
}
