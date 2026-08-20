/**
 * GET/POST /api/pages/:pageId/blocks?wsId= (§3.6).
 *
 * GET is the §9 page open and must stay at exactly ONE statement over the
 * blocks table. The guards above it read `workspaces`, `workspace_members`
 * and `pages`, never `blocks`, so tests/api/blocks-query-count can count
 * statements by table name without a denylist.
 */
import { json, route } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { createBlockSchema } from "@/lib/validation/blocks-ops";
import { requireDocs, requireLivePage } from "@/lib/services/pages-access";
import { createBlock, listPageBlocks } from "@/lib/services/blocks";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const page = requireLivePage(docs, ctx.params.id as string);
  return json({ pageId: page.id, blocks: listPageBlocks(docs, page.id) });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBody(ctx.request, createBlockSchema);
  return json({ block: createBlock(docs, ctx.params.id as string, body) }, 201);
});
