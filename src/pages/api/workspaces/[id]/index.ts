/**
 * GET/PATCH/DELETE /api/workspaces/:id — PATCH admin+ (name/slug/timezone),
 * DELETE owner-only with body {confirm: "<slug>"} (type-to-confirm).
 */
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { isValidSlug } from "@/lib/api/provision";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,40}$/).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

const deleteSchema = z.object({ confirm: z.string() });

export const GET = route(async (ctx: Ctx) => {
  const { workspace, member } = requireWorkspace(ctx.request, ctx.params.id);
  return json({ workspace, role: member.role });
});

export const PATCH = route(async (ctx: Ctx) => {
  const { workspace } = requireWorkspace(ctx.request, ctx.params.id, "admin");
  const body = await parseBodyOptional(ctx.request, patchSchema);

  const patch: Partial<typeof workspaces.$inferInsert> = { updatedAt: Date.now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.timezone !== undefined) patch.timezone = body.timezone;
  if (body.slug !== undefined) {
    if (!isValidSlug(body.slug)) {
      throw new HttpError("VALIDATION", "Invalid slug", ["slug: 3-40 lowercase letters, digits, dashes"]);
    }
    const clash = currentDb()
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.slug, body.slug), ne(workspaces.id, workspace.id)))
      .get();
    if (clash) throw new HttpError("CONFLICT", "Slug already taken", [`slug: ${body.slug}`]);
    patch.slug = body.slug;
  }

  currentDb().update(workspaces).set(patch).where(eq(workspaces.id, workspace.id)).run();
  const updated = currentDb().select().from(workspaces).where(eq(workspaces.id, workspace.id)).get();
  return json({ workspace: updated });
});

export const DELETE = route(async (ctx: Ctx) => {
  const { workspace, member } = requireWorkspace(ctx.request, ctx.params.id, "owner");
  if (member.role !== "owner") throw new HttpError("FORBIDDEN", "Owner role required");
  const body = await parseBodyOptional(ctx.request, deleteSchema);
  if (body.confirm !== workspace.slug) {
    throw new HttpError("VALIDATION", "Confirmation mismatch", [
      `confirm: must equal the workspace slug "${workspace.slug}"`,
    ]);
  }
  currentDb().delete(workspaces).where(eq(workspaces.id, workspace.id)).run();
  return json({ ok: true });
});
