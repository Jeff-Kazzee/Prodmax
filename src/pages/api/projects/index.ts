/** GET/POST /api/projects?wsId= — list (position order) / create (§3.5). */
import { createProjectSchema } from "@/lib/validation/projects";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { createProject, listProjects } from "@/lib/services/projects";

type Ctx = { request: Request };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId);
  return json({ data: listProjects(wsId, ctx.request), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, createProjectSchema);
  return json({ project: createProject(wsId, body) }, 201);
});
