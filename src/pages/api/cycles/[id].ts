/**
 * PATCH /api/cycles/:id?wsId= — surgery: name, startsAt, endsAt (incl.
 * end-early, FM-032). Stored status is re-derived after date changes;
 * completed cycles are immutable (409).
 */
import { patchCycleSchema } from "@/lib/validation/cycles";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { patchCycle } from "@/lib/services/cycles";
import { requireWsId } from "@/lib/services/issues-helpers";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const PATCH = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId, "member");
  const body = await parseBodyOptional(ctx.request, patchCycleSchema);
  return json({ cycle: patchCycle(wsId, member, ctx.params.id as string, body) });
});
