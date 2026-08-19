/**
 * GET /api/cycles?wsId=&teamId= — cycles for a team with status + stats.
 * POST /api/cycles?wsId= — {teamId, number?, name?, startsAt, endsAt}.
 *
 * Constraint amendment: §3.5 puts the list at GET /api/teams/:teamId/cycles,
 * but src/pages/api/teams/** is outside T-005's owns list, so it lives here.
 */
import { createCycleSchema } from "@/lib/validation/cycles";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { createCycle, listCycles } from "@/lib/services/cycles";
import { requireWsId } from "@/lib/services/issues-helpers";

type Ctx = { request: Request };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const teamId = new URL(ctx.request.url).searchParams.get("teamId");
  if (!teamId) throw new HttpError("VALIDATION", "teamId query parameter is required", ["teamId: required"]);
  return json({ data: listCycles(wsId, member, teamId), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, createCycleSchema);
  return json({ cycle: createCycle(wsId, member, body) }, 201);
});
