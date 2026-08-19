/**
 * POST /api/cycles/:id/scope?wsId= — {add[], remove[]}: set/clear
 * issues.cycleId in one logical operation; returns resulting scope counts.
 * Completed cycles are frozen (409); offending issue ids → 422.
 */
import { cycleScopeSchema } from "@/lib/validation/cycles";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { updateCycleScope } from "@/lib/services/cycles";
import { requireWsId } from "@/lib/services/issues-helpers";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, cycleScopeSchema);
  return json(updateCycleScope(wsId, member, ctx.params.id as string, body));
});
