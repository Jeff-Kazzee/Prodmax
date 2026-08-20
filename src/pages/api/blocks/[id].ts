/** PATCH/DELETE /api/blocks/:id?wsId=. Single-block edit and soft delete (§3.6). */
import { json, route } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { expectedVersionOf, requireWsId } from "@/lib/services/issues-helpers";
import { patchBlockSchema } from "@/lib/validation/blocks-ops";
import { requireDocs } from "@/lib/services/pages-access";
import { deleteBlock, patchBlock } from "@/lib/services/blocks";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const PATCH = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBody(ctx.request, patchBlockSchema);
  return json({ block: patchBlock(docs, ctx.params.id as string, body, expectedVersionOf(ctx.request)) });
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  return json(deleteBlock(docs, ctx.params.id as string, expectedVersionOf(ctx.request)));
});
