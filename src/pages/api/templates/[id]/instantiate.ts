/**
 * POST /api/templates/:id/instantiate?wsId= (§3.6, §2.7).
 *
 * A page template creates a page and clones its block tree. An issue template
 * returns a prefilled payload for the client to post to /api/issues; see the
 * header of src/lib/services/templates.ts for why it does not create the issue
 * itself.
 */
import { json, route } from "@/lib/api/errors";
import { parseBodyOptional } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { instantiateTemplateSchema } from "@/lib/validation/pages-templates";
import { requireDocs } from "@/lib/services/pages-access";
import { instantiateTemplate } from "@/lib/services/templates";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBodyOptional(ctx.request, instantiateTemplateSchema);
  const result = instantiateTemplate(docs, ctx.params.id as string, body);
  return json(result, result.kind === "page" ? 201 : 200);
});
