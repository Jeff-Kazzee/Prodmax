/** POST/DELETE /api/issues/:id/subscribers */
import { subscriberBodySchema } from "@/lib/validation/issues";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { addSubscriber, listSubscribers, removeSubscriber } from "@/lib/services/issues-relations";
import { requireLiveIssue } from "@/lib/services/issues-scope";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  return json({ data: listSubscribers(issue.id), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  const body = await parseBodyOptional(ctx.request, subscriberBodySchema);
  const userId = body.userId ?? member.userId;
  addSubscriber(issue.id, userId, body.reason ?? "manual");
  return json({ ok: true, userId }, 201);
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  const userId = new URL(ctx.request.url).searchParams.get("userId") ?? member.userId;
  removeSubscriber(issue.id, userId);
  return json({ ok: true });
});
