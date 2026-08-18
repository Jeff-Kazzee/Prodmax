/** POST /api/views/:id/favorite — toggle per-user favorite. */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { requireWsId } from "@/lib/services/issues-helpers";
import { toggleViewFavorite } from "@/lib/services/views";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json(toggleViewFavorite(wsId, member.userId, ctx.params.id as string));
});
