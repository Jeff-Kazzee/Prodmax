/** GET/POST /api/issues/:id/comments */
import { commentBodySchema } from "@/lib/validation/issues";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { createIssueComment, listIssueComments } from "@/lib/services/comments";
import { requireWsId } from "@/lib/services/issues-helpers";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json({ data: listIssueComments(wsId, member, ctx.params.id as string), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, commentBodySchema);
  return json({ comment: createIssueComment(wsId, member, ctx.params.id as string, body) }, 201);
});
