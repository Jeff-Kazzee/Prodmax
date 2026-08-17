/** DELETE /api/workspaces/:id/invites/:inviteId — revoke (admin+). */
import { eq } from "drizzle-orm";
import { invites } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import type { APIRoute } from "astro";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const DELETE: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  requireWorkspace(ctx.request, ctx.params.id, "admin");
  const invite = currentDb()
    .select()
    .from(invites)
    .where(eq(invites.id, ctx.params.inviteId as string))
    .get();
  if (!invite || invite.workspaceId !== ctx.params.id) {
    throw new HttpError("NOT_FOUND", "Invite not found");
  }
  currentDb()
    .update(invites)
    .set({ revokedAt: Date.now() })
    .where(eq(invites.id, invite.id))
    .run();
  return json({ ok: true });
});
