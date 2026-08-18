/**
 * GET/PATCH/DELETE /api/issues/:id — id may be uuid, PRO-123, or a redirect.
 */
import { patchIssueSchema } from "@/lib/validation/issues";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { getIssue, trashIssue } from "@/lib/services/issues";
import { expectedVersionOf, requireWsId } from "@/lib/services/issues-helpers";
import { updateIssue } from "@/lib/services/issues-update";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json({ issue: getIssue(wsId, member, ctx.params.id as string) });
});

export const PATCH = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBodyOptional(ctx.request, patchIssueSchema);
  return json({
    issue: updateIssue(wsId, member, ctx.params.id as string, body, expectedVersionOf(ctx.request)),
  });
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json({ issue: trashIssue(wsId, member, ctx.params.id as string, expectedVersionOf(ctx.request)) });
});
