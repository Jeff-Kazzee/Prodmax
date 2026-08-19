/**
 * Milestones service (M4a; architecture §2.4, §3.5): CRUD under a project
 * plus DERIVED completion — progress is computed from member issues on
 * every read and never stored (§2.4). Lists batch the derivation into ONE
 * grouped aggregate over issues (GROUP BY milestone_id), so listing a
 * project costs 2 queries regardless of milestone count.
 *
 * Counting rules (workflow category lives on states.category):
 * - issues join their workflow state; soft-deleted issues excluded;
 * - 'canceled' issues excluded from every total;
 * - startedOrCompleted = category IN ('started','completed');
 * - completed = category 'completed';
 * - points* sum COALESCE(estimate, 0) over the same populations.
 */
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { issues, milestones, projects, states } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { z } from "zod";
import type { createMilestoneSchema, patchMilestoneSchema } from "@/lib/validation/projects-milestones";

export type ProjectRow = typeof projects.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type PatchMilestoneInput = z.infer<typeof patchMilestoneSchema>;

/** Derived (never stored) completion counters for one milestone (§2.4). */
export interface MilestoneProgress {
  total: number;
  startedOrCompleted: number;
  completed: number;
  pointsTotal: number;
  pointsDone: number;
}

export type MilestoneWithProgress = MilestoneRow & { progress: MilestoneProgress };

const EMPTY_PROGRESS: MilestoneProgress = {
  total: 0,
  startedOrCompleted: 0,
  completed: 0,
  pointsTotal: 0,
  pointsDone: 0,
};

function emptyProgress(): MilestoneProgress {
  return { ...EMPTY_PROGRESS };
}

/** Load a project by id; 404 for missing or soft-deleted rows. */
export function requireLiveProject(projectId: string): ProjectRow {
  const project = currentDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project || project.deletedAt !== null) throw new HttpError("NOT_FOUND", "Project not found");
  return project;
}

/**
 * Load a live milestone without a workspace check so an endpoint can
 * resolve which workspace to guard (404 for missing/soft-deleted rows —
 * same no-leak semantics as scopedEntity once the guard runs).
 */
export function requireMilestoneForScope(milestoneId: string): MilestoneRow {
  const milestone = currentDb().select().from(milestones).where(eq(milestones.id, milestoneId)).get();
  if (!milestone || milestone.deletedAt !== null) throw new HttpError("NOT_FOUND", "Milestone not found");
  return milestone;
}

/** Workspace-scoped live milestone whose parent project is also live. */
function requireLiveMilestone(wsId: string, milestoneId: string): MilestoneRow {
  const milestone = requireMilestoneForScope(milestoneId);
  if (milestone.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Milestone not found");
  requireLiveProject(milestone.projectId);
  return milestone;
}

/** ONE grouped aggregate over issues → derived progress per milestone id. */
function progressByMilestone(wsId: string, milestoneIds: string[]): Map<string, MilestoneProgress> {
  const byId = new Map<string, MilestoneProgress>();
  if (milestoneIds.length === 0) return byId;
  const rows = currentDb()
    .select({
      milestoneId: issues.milestoneId,
      total: sql<number>`count(*)`,
      startedOrCompleted: sql<number>`coalesce(sum(case when ${states.category} in ('started', 'completed') then 1 else 0 end), 0)`,
      completed: sql<number>`coalesce(sum(case when ${states.category} = 'completed' then 1 else 0 end), 0)`,
      pointsTotal: sql<number>`coalesce(sum(coalesce(${issues.estimate}, 0)), 0)`,
      pointsDone: sql<number>`coalesce(sum(case when ${states.category} = 'completed' then coalesce(${issues.estimate}, 0) else 0 end), 0)`,
    })
    .from(issues)
    .innerJoin(states, eq(states.id, issues.stateId))
    .where(
      and(
        eq(issues.workspaceId, wsId),
        inArray(issues.milestoneId, milestoneIds),
        isNull(issues.deletedAt),
        ne(states.category, "canceled"),
      ),
    )
    .groupBy(issues.milestoneId)
    .all();
  for (const row of rows) {
    if (row.milestoneId === null) continue;
    byId.set(row.milestoneId, {
      total: row.total,
      startedOrCompleted: row.startedOrCompleted,
      completed: row.completed,
      pointsTotal: row.pointsTotal,
      pointsDone: row.pointsDone,
    });
  }
  return byId;
}

/** Append position for a new milestone: one key past the last live sibling. */
function nextMilestonePosition(projectId: string): string {
  const positions = currentDb()
    .select({ position: milestones.position })
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
    .all()
    .map((row) => row.position)
    .sort();
  return generateKeyBetween(positions.at(-1) ?? null, null);
}

/** Live milestones of a project, position-ordered, with derived progress. */
export function listMilestones(wsId: string, projectId: string): MilestoneWithProgress[] {
  const rows = currentDb()
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.workspaceId, wsId),
        eq(milestones.projectId, projectId),
        isNull(milestones.deletedAt),
      ),
    )
    .orderBy(asc(milestones.position), asc(milestones.id))
    .all();
  const byId = progressByMilestone(wsId, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, progress: byId.get(row.id) ?? emptyProgress() }));
}

export function createMilestone(
  wsId: string,
  projectId: string,
  input: CreateMilestoneInput,
): MilestoneWithProgress {
  const id = uuid7();
  currentDb()
    .insert(milestones)
    .values({
      id,
      workspaceId: wsId,
      projectId,
      name: input.name,
      targetDate: input.targetDate ?? null,
      position: input.position ?? nextMilestonePosition(projectId),
      createdAt: Date.now(),
    })
    .run();
  const row = currentDb().select().from(milestones).where(eq(milestones.id, id)).get()!;
  return { ...row, progress: emptyProgress() };
}

export function updateMilestone(
  wsId: string,
  milestoneId: string,
  input: PatchMilestoneInput,
): MilestoneWithProgress {
  const milestone = requireLiveMilestone(wsId, milestoneId);
  const patch: Partial<typeof milestones.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.targetDate !== undefined) patch.targetDate = input.targetDate;
  if (input.position !== undefined) patch.position = input.position;
  if (Object.keys(patch).length > 0) {
    currentDb().update(milestones).set(patch).where(eq(milestones.id, milestone.id)).run();
  }
  const row = currentDb().select().from(milestones).where(eq(milestones.id, milestone.id)).get()!;
  const byId = progressByMilestone(wsId, [milestone.id]);
  return { ...row, progress: byId.get(milestone.id) ?? emptyProgress() };
}

/**
 * Soft delete via deleted_at. Member issues keep their milestoneId (the
 * FK's set-null only fires on hard delete); they simply stop contributing
 * to any listed milestone's progress.
 */
export function trashMilestone(wsId: string, milestoneId: string): MilestoneRow {
  const milestone = requireLiveMilestone(wsId, milestoneId);
  currentDb().update(milestones).set({ deletedAt: Date.now() }).where(eq(milestones.id, milestone.id)).run();
  return currentDb().select().from(milestones).where(eq(milestones.id, milestone.id)).get()!;
}
