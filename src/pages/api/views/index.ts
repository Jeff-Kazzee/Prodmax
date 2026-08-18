/** GET/POST /api/views?wsId= */
import { createViewSchema } from "@/lib/validation/views";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { createView, listViews } from "@/lib/services/views";

export const GET = route(async (ctx: { request: Request }) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json({ data: listViews(wsId, member.userId), nextCursor: null });
});

export const POST = route(async (ctx: { request: Request }) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, createViewSchema);
  return json({ view: createView(wsId, member, body) }, 201);
});
