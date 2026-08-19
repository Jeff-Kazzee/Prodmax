/**
 * Materialized project progress caches (M4a, T-005; architecture §9 row 3).
 *
 * progress_cache / progress_points_cache are maintained on the write path by
 * an issue-mutation listener registered at module scope — importing this
 * module (directly or via ./projects) arms the hook exactly once. Reads
 * NEVER recompute. Cost per issue write: O(1) indexed queries (one PK fetch,
 * at most one issue_history lookup, then one aggregate + one UPDATE per
 * affected project).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { issueHistory, issues, projects, states } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { onIssueMutation, type IssueMutation } from "./issues-events";

export interface ProgressPoints {
  done: number;
  total: number;
}

/** Parse stored progress_points_cache JSON (estimate-weighted {done,total}). */
export function parseProgressPoints(raw: string | null): ProgressPoints | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ProgressPoints>;
    if (typeof parsed.done === "number" && typeof parsed.total === "number") {
      return { done: parsed.done, total: parsed.total };
    }
  } catch {
    /* malformed cache → treat as absent */
  }
  return null;
}

/**
 * Recompute BOTH caches for one project: ONE aggregate query over issues
 * joined to states (live issues, state category != 'canceled'; covered by
 * issues_project_idx), then ONE UPDATE. progress_cache =
 * round(100*done/total), 0 when total = 0; progress_points_cache =
 * estimate-weighted {done,total} with NULL estimates counting as 0.
 */
export function recomputeProjectProgress(projectId: string): void {
  const db = currentDb();
  const agg = db
    .select({
      total: sql<number>`count(*)`,
      done: sql<number>`coalesce(sum(case when ${states.category} = 'completed' then 1 else 0 end), 0)`,
      pointsTotal: sql<number>`coalesce(sum(coalesce(${issues.estimate}, 0)), 0)`,
      pointsDone: sql<number>`coalesce(sum(case when ${states.category} = 'completed' then coalesce(${issues.estimate}, 0) else 0 end), 0)`,
    })
    .from(issues)
    .innerJoin(states, eq(issues.stateId, states.id))
    .where(and(eq(issues.projectId, projectId), isNull(issues.deletedAt), sql`${states.category} != 'canceled'`))
    .get();
  const total = agg?.total ?? 0;
  const done = agg?.done ?? 0;
  const points: ProgressPoints = { done: agg?.pointsDone ?? 0, total: agg?.pointsTotal ?? 0 };
  db.update(projects)
    .set({
      progressCache: total === 0 ? 0 : Math.round((100 * done) / total),
      progressPointsCache: JSON.stringify(points),
    })
    .where(eq(projects.id, projectId))
    .run();
}

/**
 * The mutation event carries only the NEW projectId; the previous one was
 * recorded (JSON-encoded) in issue_history by recordFieldChange before the
 * write — read it back via indexed lookups only. Known gap: field changes
 * inside issues-history's 3-minute create grace window are folded away, so
 * create → re-project within grace leaves the old project's cache stale
 * until the next mutation affecting it (flagged for the T-005 integration
 * checkpoint — closing it needs a one-line amendment in issues-update.ts).
 */
function previousProjectId(issueId: string): string | null {
  const row = currentDb()
    .select({ oldValue: issueHistory.oldValue })
    .from(issueHistory)
    .where(and(eq(issueHistory.issueId, issueId), eq(issueHistory.field, "project")))
    .orderBy(desc(issueHistory.id))
    .limit(1)
    .get();
  if (!row?.oldValue) return null;
  try {
    const parsed: unknown = JSON.parse(row.oldValue);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Projects whose caches an issue mutation can affect (O(1) indexed queries). */
export function affectedProjectIds(event: IssueMutation): string[] {
  const ids = new Set<string>();
  // One indexed PK fetch covers created/updated/deleted/moved: a soft-deleted
  // row is still fetchable, and the recompute then excludes it from totals.
  const row = currentDb()
    .select({ projectId: issues.projectId })
    .from(issues)
    .where(eq(issues.id, event.issueId))
    .get();
  if (row?.projectId) ids.add(row.projectId);
  if (event.kind === "updated" && event.patch) {
    if (typeof event.patch.projectId === "string") ids.add(event.patch.projectId);
    if ("projectId" in event.patch) {
      const prev = previousProjectId(event.issueId);
      if (prev) ids.add(prev);
    }
  }
  return [...ids];
}

/** Listener: refresh the materialized caches of every affected project. */
export function syncProjectProgress(event: IssueMutation): void {
  for (const projectId of affectedProjectIds(event)) recomputeProjectProgress(projectId);
}

// Arm the hook: any import of this module (e.g. via ./projects or the
// projects endpoints) registers the listener exactly once per module graph.
onIssueMutation(syncProjectProgress);
