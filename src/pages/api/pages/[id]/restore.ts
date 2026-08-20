/** POST /api/pages/:id/restore?wsId=. Undo a soft delete (§3.6, FM-050). */
import { json, route } from "@/lib/api/errors";
import { requireWsId } from "@/lib/services/issues-helpers";
import { requireDocs } from "@/lib/services/pages-access";
import { restorePage } from "@/lib/services/pages-trash";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  return json({ page: restorePage(docs, ctx.params.id as string) });
});
