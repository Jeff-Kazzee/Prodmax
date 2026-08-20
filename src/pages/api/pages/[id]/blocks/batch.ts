/**
 * POST /api/pages/:pageId/blocks/batch?wsId=. Paste, multi-drag, and the
 * ED-12 autosave flush, applied as one transaction (§3.6).
 *
 * The op cap answers 413 rather than 400: an oversize batch is a payload
 * problem, and the client's remedy is to split it, not to fix a field.
 */
import { json, route } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { blockBatchSchema } from "@/lib/validation/blocks-ops";
import { requireDocs } from "@/lib/services/pages-access";
import { applyBlockOps } from "@/lib/services/blocks";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBody(ctx.request, blockBatchSchema);
  return json(applyBlockOps(docs, ctx.params.id as string, body.ops));
});
