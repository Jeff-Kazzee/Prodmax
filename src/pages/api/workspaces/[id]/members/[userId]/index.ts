/**
 * PATCH /api/workspaces/:id/members/:userId — {role} admin+; the owner
 * role may only be granted/changed by an owner; the last owner cannot be
 * demoted (409). DELETE — admin+; owners are removable only by themselves
 * (self-leave), and the last owner cannot leave (409).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { workspaceMembers } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "member", "guest"]).optional(),
});

function loadTarget(wsId: string, userId: string) {
  return currentDb()
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)))
    .get();
}

function ownerCount(wsId: string): number {
  return currentDb()
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.role, "owner")))
    .all().length;
}

export const PATCH = route(async (ctx: Ctx) => {
  const { member: actor } = requireWorkspace(ctx.request, ctx.params.id, "admin");
  const body = await parseBodyOptional(ctx.request, patchSchema);
  const target = loadTarget(ctx.params.id as string, ctx.params.userId as string);
  if (!target) throw new HttpError("NOT_FOUND", "Member not found");

  if (body.role !== undefined) {
    // Owner role is only granted/revoked by an owner (§3.2, §7).
    if ((target.role === "owner" || body.role === "owner") && actor.role !== "owner") {
      throw new HttpError("FORBIDDEN", "Only an owner can change the owner role");
    }
    if (target.role === "owner" && body.role !== "owner" && ownerCount(ctx.params.id as string) <= 1) {
      throw new HttpError("CONFLICT", "Cannot demote the last owner; transfer ownership first");
    }
    currentDb()
      .update(workspaceMembers)
      .set({ role: body.role })
      .where(eq(workspaceMembers.id, target.id))
      .run();
  }

  const updated = currentDb()
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.id, target.id))
    .get();
  return json({ member: updated });
});

export const DELETE = route(async (ctx: Ctx) => {
  const { ctx: sessionCtx, member: actor } = requireWorkspace(ctx.request, ctx.params.id, "admin");
  const target = loadTarget(ctx.params.id as string, ctx.params.userId as string);
  if (!target) throw new HttpError("NOT_FOUND", "Member not found");

  if (target.role === "owner") {
    // Owners are removable only by themselves (leaving).
    if (target.userId !== sessionCtx.user.id) {
      throw new HttpError("FORBIDDEN", "Owners can only be removed by themselves");
    }
    if (ownerCount(ctx.params.id as string) <= 1) {
      throw new HttpError("CONFLICT", "The last owner cannot leave; transfer ownership first");
    }
  }

  currentDb().delete(workspaceMembers).where(eq(workspaceMembers.id, target.id)).run();
  return json({ ok: true });
});
