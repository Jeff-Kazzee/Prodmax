/**
 * PATCH/DELETE /api/labels/:id — admin+, workspace-scoped (404 on
 * cross-workspace). DELETE removes the label (and its issue links);
 * archive = PATCH {archived: true} keeps them.
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { labels } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  description: z.string().trim().max(200).nullable().optional(),
  archived: z.boolean().optional(),
});

function loadLabel(request: Request, labelId: string | undefined, minRole?: "admin") {
  const db = currentDb();
  const label = db.select().from(labels).where(eq(labels.id, labelId as string)).get();
  if (!label) throw new HttpError("NOT_FOUND", "Label not found");
  requireWorkspace(request, label.workspaceId, minRole);
  return label;
}

export const PATCH = route(async (ctx: Ctx) => {
  const label = loadLabel(ctx.request, ctx.params.id, "admin");
  const body = await parseBodyOptional(ctx.request, patchSchema);
  const db = currentDb();

  if (body.name !== undefined && body.name !== label.name) {
    const dup = db
      .select({ id: labels.id })
      .from(labels)
      .where(
        and(
          eq(labels.workspaceId, label.workspaceId),
          label.teamId === null ? isNull(labels.teamId) : eq(labels.teamId, label.teamId),
          eq(labels.name, body.name),
        ),
      )
      .get();
    if (dup) throw new HttpError("CONFLICT", "Label name already used in this scope", [`name: ${body.name}`]);
  }

  const patch: Partial<typeof labels.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.color !== undefined) patch.color = body.color;
  if (body.description !== undefined) patch.description = body.description;
  if (body.archived !== undefined) patch.archivedAt = body.archived ? Date.now() : null;
  if (Object.keys(patch).length > 0) {
    db.update(labels).set(patch).where(eq(labels.id, label.id)).run();
  }
  return json({ label: db.select().from(labels).where(eq(labels.id, label.id)).get() });
});

export const DELETE = route(async (ctx: Ctx) => {
  const label = loadLabel(ctx.request, ctx.params.id, "admin");
  currentDb().delete(labels).where(eq(labels.id, label.id)).run();
  return json({ ok: true });
});
