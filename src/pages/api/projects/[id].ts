/**
 * GET/PATCH/DELETE /api/projects/:id?wsId= — GET returns the materialized
 * progressCache + parsed progressPoints + derived lastUpdateAt (§3.5, §9).
 * PATCH covers mutable fields incl. archive via {archived}; DELETE soft-deletes.
 */
import { patchProjectSchema } from "@/lib/validation/projects";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { getProject, trashProject, updateProject } from "@/lib/services/projects";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId);
  return json({ project: getProject(wsId, ctx.params.id as string) });
});

export const PATCH = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId);
  const body = await parseBodyOptional(ctx.request, patchProjectSchema);
  return json({ project: updateProject(wsId, ctx.params.id as string, body) });
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId);
  return json({ project: trashProject(wsId, ctx.params.id as string) });
});
