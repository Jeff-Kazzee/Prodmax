/**
 * Projects service (M4a, T-005): CRUD + derived last_update_at. The
 * materialized progress caches live in ./projects-progress and are NEVER
 * recomputed on read (architecture §9).
 */
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { favorites, pages, projects, projectUpdates, workspaceMembers } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { z } from "zod";
import type { createProjectSchema, patchProjectSchema } from "@/lib/validation/projects";
import { EMPTY_PROGRESS, parseProgressPoints } from "./projects-progress";

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;
export type ProjectRow = typeof projects.$inferSelect;

function serialize(row: ProjectRow, lastUpdateAt: number | null, favorited: boolean) {
  return {
    ...row,
    progressPoints: parseProgressPoints(row.progressPointsCache),
    lastUpdateAt,
    favorited,
  };
}

/**
 * Which of these projects the reader has starred (T-029).
 *
 * A star is per-user, so it cannot live on the project row. One query for the
 * whole page keeps the list at a fixed query count rather than one per row.
 */
function favoritedIds(userId: string, projectIds: string[]): Set<string> {
  if (projectIds.length === 0) return new Set();
  const rows = currentDb()
    .select({ entityId: favorites.entityId })
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, userId),
        eq(favorites.entityType, "project"),
        inArray(favorites.entityId, projectIds),
      ),
    )
    .all();
  return new Set(rows.map((r) => r.entityId));
}

/**
 * Toggle a star and report the resulting state, mirroring the views route.
 * Returns what is true after the write, so the caller never has to guess.
 */
export function toggleProjectFavorite(wsId: string, userId: string, id: string): boolean {
  const project = requireProject(wsId, id);
  const existing = currentDb()
    .select({ id: favorites.id })
    .from(favorites)
    .where(
      and(
        eq(favorites.userId, userId),
        eq(favorites.entityType, "project"),
        eq(favorites.entityId, project.id),
      ),
    )
    .get();
  if (existing) {
    currentDb().delete(favorites).where(eq(favorites.id, existing.id)).run();
    return false;
  }
  currentDb()
    .insert(favorites)
    .values({
      id: uuid7(),
      workspaceId: wsId,
      userId,
      entityType: "project",
      entityId: project.id,
      createdAt: Date.now(),
    })
    .run();
  return true;
}

/** last_update_at is derived (§2.4): MAX(project_updates.created_at) per project. */
function lastUpdateAtByProject(wsId: string, projectId?: string): Map<string, number> {
  const clauses: SQL[] = [eq(projectUpdates.workspaceId, wsId)];
  if (projectId) clauses.push(eq(projectUpdates.projectId, projectId));
  const rows = currentDb()
    .select({ projectId: projectUpdates.projectId, last: sql<number>`max(${projectUpdates.createdAt})` })
    .from(projectUpdates)
    .where(and(...clauses))
    .groupBy(projectUpdates.projectId)
    .all();
  return new Map(rows.map((r) => [r.projectId, r.last]));
}

/**
 * Both columns are foreign keys, so an id from another workspace reaches SQLite
 * and surfaces as a bare 500 instead of the §3 error shape. Resolve the lead
 * through workspace membership rather than the global users table, so a user of
 * another workspace is rejected rather than silently accepted.
 */
function assertReferencesInWorkspace(wsId: string, input: { leadId?: string | null; briefPageId?: string | null }): void {
  if (input.leadId) {
    const member = currentDb()
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, input.leadId)))
      .get();
    if (!member) {
      throw new HttpError("VALIDATION", "leadId must be a member of this workspace", [`leadId: ${input.leadId}`]);
    }
  }
  if (input.briefPageId) {
    const page = currentDb()
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.workspaceId, wsId), eq(pages.id, input.briefPageId), isNull(pages.deletedAt)))
      .get();
    if (!page) {
      throw new HttpError("VALIDATION", "briefPageId must be a live page in this workspace", [
        `briefPageId: ${input.briefPageId}`,
      ]);
    }
  }
}

export function requireProject(wsId: string, id: string): ProjectRow {
  const row = currentDb().select().from(projects).where(eq(projects.id, id)).get();
  if (!row || row.workspaceId !== wsId || row.deletedAt) {
    throw new HttpError("NOT_FOUND", "Project not found");
  }
  return row;
}

/**
 * Non-deleted projects ordered by fractional position. `?archived=` mirrors
 * the issues list: archived rows are included by default (the flag is a
 * payload field); archived=true|false filters to either side.
 */
export function listProjects(wsId: string, request: Request, userId: string) {
  const archived = new URL(request.url).searchParams.get("archived");
  const clauses: SQL[] = [eq(projects.workspaceId, wsId), isNull(projects.deletedAt)];
  if (archived === "true") clauses.push(isNotNull(projects.archivedAt));
  if (archived === "false") clauses.push(isNull(projects.archivedAt));
  const rows = currentDb()
    .select()
    .from(projects)
    .where(and(...clauses))
    .orderBy(asc(projects.position))
    .all();
  const lastByProject = lastUpdateAtByProject(wsId);
  const starred = favoritedIds(userId, rows.map((row) => row.id));
  return rows.map((row) => serialize(row, lastByProject.get(row.id) ?? null, starred.has(row.id)));
}

/** Returns the stored materialized caches as-is — never a read-time recompute (§9). */
export function getProject(wsId: string, id: string, userId: string) {
  const row = requireProject(wsId, id);
  return serialize(
    row,
    lastUpdateAtByProject(wsId, id).get(id) ?? null,
    favoritedIds(userId, [row.id]).has(row.id),
  );
}

function nextProjectPosition(wsId: string): string {
  const last =
    currentDb()
      .select({ position: projects.position })
      .from(projects)
      .where(eq(projects.workspaceId, wsId))
      .all()
      .map((r) => r.position)
      .sort()
      .at(-1) ?? null;
  return generateKeyBetween(last, null);
}

export function createProject(wsId: string, userId: string, input: CreateProjectInput) {
  assertReferencesInWorkspace(wsId, input);
  const now = Date.now();
  const id = uuid7();
  currentDb()
    .insert(projects)
    .values({
      id,
      workspaceId: wsId,
      name: input.name,
      descriptionMd: input.descriptionMd ?? null,
      status: input.status ?? "backlog",
      leadId: input.leadId ?? null,
      targetStartDate: input.targetStartDate ?? null,
      targetEndDate: input.targetEndDate ?? null,
      color: input.color ?? null,
      briefPageId: input.briefPageId ?? null,
      position: nextProjectPosition(wsId),
      progressCache: 0,
      progressPointsCache: JSON.stringify(EMPTY_PROGRESS),
      updateCadence: input.updateCadence ?? "off",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getProject(wsId, id, userId);
}

export function updateProject(wsId: string, userId: string, id: string, input: PatchProjectInput) {
  const row = requireProject(wsId, id);
  assertReferencesInWorkspace(wsId, input);
  const now = Date.now();
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: now };
  if (input.name !== undefined) patch.name = input.name;
  if (input.descriptionMd !== undefined) patch.descriptionMd = input.descriptionMd;
  if (input.status !== undefined) patch.status = input.status;
  if (input.leadId !== undefined) patch.leadId = input.leadId;
  if (input.targetStartDate !== undefined) patch.targetStartDate = input.targetStartDate;
  if (input.targetEndDate !== undefined) patch.targetEndDate = input.targetEndDate;
  if (input.color !== undefined) patch.color = input.color;
  if (input.briefPageId !== undefined) patch.briefPageId = input.briefPageId;
  if (input.updateCadence !== undefined) patch.updateCadence = input.updateCadence;
  if (input.position !== undefined) patch.position = input.position;
  if (input.archived !== undefined) patch.archivedAt = input.archived ? now : null;
  currentDb().update(projects).set(patch).where(eq(projects.id, row.id)).run();
  return getProject(wsId, id, userId);
}

/** Soft delete (deleted_at), matching the issues trash convention. */
export function trashProject(wsId: string, id: string) {
  const row = requireProject(wsId, id);
  const now = Date.now();
  currentDb().update(projects).set({ deletedAt: now, updatedAt: now }).where(eq(projects.id, row.id)).run();
  const trashed = currentDb().select().from(projects).where(eq(projects.id, row.id)).get()!;
  // A trashed project is not on anyone's list, so the star is not asserted.
  return serialize(trashed, null, false);
}
