/**
 * GET /api/issues?wsId=&filters&sort&limit&cursor
 * POST /api/issues?wsId= — {teamId, title, …}; suggestions reserved for T-011.
 */
import { createIssueSchema } from "@/lib/validation/issues";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { createIssue, listIssues } from "@/lib/services/issues";
import { requireWsId } from "@/lib/services/issues-helpers";

type Ctx = { request: Request };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json(listIssues(wsId, member, ctx.request));
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, createIssueSchema);
  const created = createIssue(wsId, member, body);
  const { suggestions, ...issue } = created;
  return json({ issue, suggestions }, 201);
});
