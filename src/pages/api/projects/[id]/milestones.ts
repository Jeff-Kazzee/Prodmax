/**
 * GET/POST /api/projects/:id/milestones — position-ordered list; every
 * milestone carries derived progress (§2.4) batched into one grouped
 * aggregate query. 404 for missing/soft-deleted projects and for callers
 * outside the project's workspace (§7). Workspace is resolved from the
 * project row, so no wsId query parameter is needed.
 */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { createMilestone, listMilestones, requireLiveProject } from "@/lib/services/milestones";
import { createMilestoneSchema } from "@/lib/validation/projects-milestones";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const project = requireLiveProject(ctx.params.id as string);
  requireWorkspace(ctx.request, project.workspaceId);
  return json({ data: listMilestones(project.workspaceId, project.id), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const project = requireLiveProject(ctx.params.id as string);
  requireWorkspace(ctx.request, project.workspaceId, "member");
  const body = await parseBody(ctx.request, createMilestoneSchema);
  return json({ milestone: createMilestone(project.workspaceId, project.id, body) }, 201);
});
