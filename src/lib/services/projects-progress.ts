/**
 * Materialized project progress caches (M4a, T-005; architecture §9 row 3).
 *
 * The write path increments. `repairProjectProgress` is the full aggregate and
 * never runs on the write path. Reads never recompute.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { issues, projects, states } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
// Type-only on purpose. issues-events imports syncProjectProgress at runtime,
// so a value import back would close a runtime cycle.
import type { IssueWriteBatch, StateCategory } from "./issues-events";
import type { IssueRow } from "./issues-scope";

export interface ProgressPoints {
  done: number;
  total: number;
  issuesDone: number;
  issuesTotal: number;
}

export interface ProgressDelta {
  issues: number;
  issuesDone: number;
  points: number;
  pointsDone: number;
}

export const EMPTY_PROGRESS: ProgressPoints = { done: 0, total: 0, issuesDone: 0, issuesTotal: 0 };

/**
 * Parse stored progress_points_cache JSON. A legacy two-field row parses as
 * null so it routes to the repair path instead of reading as an empty project.
 */
export function parseProgressPoints(raw: string | null): ProgressPoints | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ProgressPoints>;
    if (
      typeof parsed.done === "number" &&
      typeof parsed.total === "number" &&
      typeof parsed.issuesDone === "number" &&
      typeof parsed.issuesTotal === "number"
    ) {
      return {
        done: parsed.done,
        total: parsed.total,
        issuesDone: parsed.issuesDone,
        issuesTotal: parsed.issuesTotal,
      };
    }
  } catch {
    /* malformed cache → treat as absent */
  }
  return null;
}

/** The stored rounded percent (§9), derived from the live issue counts. */
export function progressPercent(points: ProgressPoints): number {
  if (points.issuesTotal === 0) return 0;
  return Math.round((100 * points.issuesDone) / points.issuesTotal);
}

/**
 * Counted-set membership, one rule for every case. A snapshot counts when it
 * has a project, is live, and is not in a canceled state. Everything else,
 * joining, leaving, trashing, cancelling, completing, and re-estimating, is
 * the difference between the after contribution and the before contribution.
 */
export function contribution(row: IssueRow, category: StateCategory): ProgressDelta | null {
  if (!row.projectId) return null;
  if (row.deletedAt !== null) return null;
  if (category === "canceled") return null;
  const points = row.estimate ?? 0;
  const done = category === "completed";
  return { issues: 1, issuesDone: done ? 1 : 0, points, pointsDone: done ? points : 0 };
}

/** Resolve the category only for a snapshot that could be in the counted set. */
function contributionOf(row: IssueRow, batch: IssueWriteBatch): ProgressDelta | null {
  if (!row.projectId || row.deletedAt !== null) return null;
  return contribution(row, batch.stateCategory(row.stateId));
}

function sameDelta(a: ProgressDelta, b: ProgressDelta): boolean {
  return (
    a.issues === b.issues &&
    a.issuesDone === b.issuesDone &&
    a.points === b.points &&
    a.pointsDone === b.pointsDone
  );
}

/** True when no counted field moved, so no category needs resolving at all. */
function cannotMoveCounters(before: IssueRow, after: IssueRow): boolean {
  return (
    before.projectId === after.projectId &&
    before.stateId === after.stateId &&
    before.estimate === after.estimate &&
    (before.deletedAt === null) === (after.deletedAt === null)
  );
}

/**
 * Full aggregate over one project: ONE query over issues joined to states, then
 * ONE UPDATE. Exported as the repair and backfill entry point (T-023 depends on
 * it) and never called from the write path.
 */
export function repairProjectProgress(wsId: string, projectId: string): void {
  const db = currentDb();
  const agg = db
    .select({
      issuesTotal: sql<number>`count(*)`,
      issuesDone: sql<number>`coalesce(sum(case when ${states.category} = 'completed' then 1 else 0 end), 0)`,
      total: sql<number>`coalesce(sum(coalesce(${issues.estimate}, 0)), 0)`,
      done: sql<number>`coalesce(sum(case when ${states.category} = 'completed' then coalesce(${issues.estimate}, 0) else 0 end), 0)`,
    })
    .from(issues)
    .innerJoin(states, eq(issues.stateId, states.id))
    .where(
      and(
        eq(issues.workspaceId, wsId),
        eq(issues.projectId, projectId),
        isNull(issues.deletedAt),
        sql`${states.category} != 'canceled'`,
      ),
    )
    .get();
  const points: ProgressPoints = {
    done: agg?.done ?? 0,
    total: agg?.total ?? 0,
    issuesDone: agg?.issuesDone ?? 0,
    issuesTotal: agg?.issuesTotal ?? 0,
  };
  writeProgress(wsId, projectId, points);
}

/** Deliberate reconciliation over every live project in a workspace. */
export function repairAllProjects(wsId: string): void {
  const rows = currentDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, wsId), isNull(projects.deletedAt)))
    .all();
  for (const row of rows) repairProjectProgress(wsId, row.id);
}

function writeProgress(wsId: string, projectId: string, points: ProgressPoints): void {
  currentDb()
    .update(projects)
    .set({ progressCache: progressPercent(points), progressPointsCache: JSON.stringify(points) })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, wsId)))
    .run();
}

function accumulate(
  into: Map<string, ProgressDelta>,
  projectId: string,
  delta: ProgressDelta,
  sign: 1 | -1,
): void {
  const current = into.get(projectId) ?? { issues: 0, issuesDone: 0, points: 0, pointsDone: 0 };
  into.set(projectId, {
    issues: current.issues + sign * delta.issues,
    issuesDone: current.issuesDone + sign * delta.issuesDone,
    points: current.points + sign * delta.points,
    pointsDone: current.pointsDone + sign * delta.pointsDone,
  });
}

/**
 * Consumer: fold the whole batch into one delta per project, then one UPDATE
 * per project. A project whose cache is legacy or absent is repaired INSTEAD of
 * incremented, because the consumer runs after the issue write inside the same
 * transaction and the aggregate already counts the mutated row.
 */
export function syncProjectProgress(batch: IssueWriteBatch): void {
  const deltas = new Map<string, ProgressDelta>();
  const workspaces = new Map<string, string>();

  for (const transition of batch.transitions) {
    const { before, after } = transition;
    if (before !== null && cannotMoveCounters(before, after)) continue;

    const beforeDelta = before === null ? null : contributionOf(before, batch);
    const afterDelta = contributionOf(after, batch);

    if (beforeDelta === null && afterDelta === null) continue;
    if (
      beforeDelta !== null &&
      afterDelta !== null &&
      before !== null &&
      before.projectId === after.projectId &&
      sameDelta(beforeDelta, afterDelta)
    ) {
      continue;
    }

    if (beforeDelta !== null && before?.projectId) {
      accumulate(deltas, before.projectId, beforeDelta, -1);
      workspaces.set(before.projectId, transition.workspaceId);
    }
    if (afterDelta !== null && after.projectId) {
      accumulate(deltas, after.projectId, afterDelta, 1);
      workspaces.set(after.projectId, transition.workspaceId);
    }
  }

  for (const [projectId, delta] of deltas) {
    const wsId = workspaces.get(projectId)!;
    const row = currentDb()
      .select({ cache: projects.progressPointsCache })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, wsId)))
      .get();
    if (!row) continue;
    const current = parseProgressPoints(row.cache);
    if (current === null) {
      repairProjectProgress(wsId, projectId);
      continue;
    }
    writeProgress(wsId, projectId, {
      done: current.done + delta.pointsDone,
      total: current.total + delta.points,
      issuesDone: current.issuesDone + delta.issuesDone,
      issuesTotal: current.issuesTotal + delta.issues,
    });
  }
}
