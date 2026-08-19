/**
 * PATCH/DELETE /api/milestones/:id — workspace resolved from the milestone
 * row; missing, soft-deleted, and cross-workspace rows are all 404 (§7),
 * as are milestones whose parent project is soft-deleted. PATCH is a
 * partial update of name/targetDate/position; DELETE soft-deletes
 * (deleted_at) and leaves member issues untouched.
 */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { requireMilestoneForScope, trashMilestone, updateMilestone } from "@/lib/services/milestones";
import { patchMilestoneSchema } from "@/lib/validation/projects-milestones";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const PATCH = route(async (ctx: Ctx) => {
  const scoped = requireMilestoneForScope(ctx.params.id as string);
  requireWorkspace(ctx.request, scoped.workspaceId, "member");
  const body = await parseBodyOptional(ctx.request, patchMilestoneSchema);
  return json({ milestone: updateMilestone(scoped.workspaceId, scoped.id, body) });
});

export const DELETE = route(async (ctx: Ctx) => {
  const scoped = requireMilestoneForScope(ctx.params.id as string);
  requireWorkspace(ctx.request, scoped.workspaceId, "member");
  return json({ milestone: trashMilestone(scoped.workspaceId, scoped.id) });
});
