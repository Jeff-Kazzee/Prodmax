/**
 * GET/POST /api/projects/:id/updates?wsId= — health reports (§3.5, FM-036).
 * GET is newest-first; POST snapshots the materialized progress_cache when
 * progressSnapshot is omitted.
 */
import { createProjectUpdateSchema } from "@/lib/validation/projects";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { createProjectUpdate, listProjectUpdates } from "@/lib/services/project-updates";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId);
  return json({ data: listProjectUpdates(wsId, ctx.params.id as string), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId, "member");
  const body = await parseBody(ctx.request, createProjectUpdateSchema);
  return json({ update: createProjectUpdate(wsId, member, ctx.params.id as string, body) }, 201);
});
