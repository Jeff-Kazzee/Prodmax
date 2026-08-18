/** POST /api/issues/:id/move-team — new identifier + redirect. */
import { moveTeamSchema } from "@/lib/validation/issues";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { expectedVersionOf, requireWsId } from "@/lib/services/issues-helpers";
import { moveIssueTeam } from "@/lib/services/issues-update";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, moveTeamSchema);
  return json({
    issue: moveIssueTeam(wsId, member, ctx.params.id as string, body.teamId, expectedVersionOf(ctx.request)),
  });
});
