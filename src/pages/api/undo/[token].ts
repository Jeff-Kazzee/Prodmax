/** POST /api/undo/:token — compensating transaction for a bulk edit. */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { applyUndo } from "@/lib/services/issues-bulk";
import { requireWsId } from "@/lib/services/issues-helpers";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json(applyUndo(wsId, member.userId, ctx.params.token as string));
});
