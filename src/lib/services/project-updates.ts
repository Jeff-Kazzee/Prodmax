/**
 * Project updates (M4a, T-005): health reports on a project (§3.5, FM-036).
 * progress_snapshot defaults to the project's materialized progress_cache
 * at post time; last_update_at stays derived (see ./projects).
 */
import { desc, eq } from "drizzle-orm";
import { projectUpdates } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";
import type { z } from "zod";
import type { createProjectUpdateSchema } from "@/lib/validation/projects";
import { requireProject } from "./projects";

export type CreateProjectUpdateInput = z.infer<typeof createProjectUpdateSchema>;

/** Updates of one project, newest first (createdAt desc, id tiebreak). */
export function listProjectUpdates(wsId: string, projectId: string) {
  requireProject(wsId, projectId);
  return currentDb()
    .select()
    .from(projectUpdates)
    .where(eq(projectUpdates.projectId, projectId))
    .orderBy(desc(projectUpdates.createdAt), desc(projectUpdates.id))
    .all();
}

export function createProjectUpdate(
  wsId: string,
  actor: { userId: string; role: Role },
  projectId: string,
  input: CreateProjectUpdateInput,
) {
  const project = requireProject(wsId, projectId);
  const id = uuid7();
  currentDb()
    .insert(projectUpdates)
    .values({
      id,
      workspaceId: wsId,
      projectId,
      authorId: actor.userId,
      health: input.health,
      bodyMd: input.bodyMd,
      progressSnapshot: input.progressSnapshot ?? project.progressCache,
      createdAt: Date.now(),
    })
    .run();
  return currentDb().select().from(projectUpdates).where(eq(projectUpdates.id, id)).get()!;
}

/** DELETE /api/project-updates/:id — author of the update or workspace admin (§3.5). */
export function deleteProjectUpdate(wsId: string, actor: { userId: string; role: Role }, updateId: string) {
  const row = currentDb().select().from(projectUpdates).where(eq(projectUpdates.id, updateId)).get();
  if (!row || row.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Project update not found");
  if (row.authorId !== actor.userId && actor.role !== "admin" && actor.role !== "owner") {
    throw new HttpError("FORBIDDEN", "Only the author or an admin may delete this update");
  }
  currentDb().delete(projectUpdates).where(eq(projectUpdates.id, updateId)).run();
  return { ok: true };
}
