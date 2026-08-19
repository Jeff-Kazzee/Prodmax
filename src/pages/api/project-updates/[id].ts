/** DELETE /api/project-updates/:id?wsId= — author of the update or workspace admin (§3.5). */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { requireWsId } from "@/lib/services/issues-helpers";
import { deleteProjectUpdate } from "@/lib/services/project-updates";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId, "member");
  return json(deleteProjectUpdate(wsId, member, ctx.params.id as string));
});
