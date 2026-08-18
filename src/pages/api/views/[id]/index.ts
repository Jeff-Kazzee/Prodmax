/** GET/PATCH/DELETE /api/views/:id */
import { patchViewSchema } from "@/lib/validation/views";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { deleteView, getView, updateView } from "@/lib/services/views";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json({ view: getView(wsId, member.userId, ctx.params.id as string) });
});

export const PATCH = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBodyOptional(ctx.request, patchViewSchema);
  return json({ view: updateView(wsId, member, ctx.params.id as string, body) });
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json(deleteView(wsId, member, ctx.params.id as string));
});
