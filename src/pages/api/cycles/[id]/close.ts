/**
 * POST /api/cycles/:id/close?wsId= — one transaction (FM-031/033): freeze
 * stats_snapshot, roll open issues over to the next cycle (auto-created
 * when absent), mark the cycle completed. Second close → 409.
 */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { closeCycle } from "@/lib/services/cycles";
import { requireWsId } from "@/lib/services/issues-helpers";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId, "member");
  return json(closeCycle(wsId, member, ctx.params.id as string));
});
