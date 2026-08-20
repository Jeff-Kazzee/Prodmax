/** PATCH/DELETE /api/templates/:id?wsId= (§3.6). */
import { json, route } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { patchTemplateSchema } from "@/lib/validation/pages-templates";
import { requireDocs } from "@/lib/services/pages-access";
import { deleteTemplate, patchTemplate } from "@/lib/services/templates";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const PATCH = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBody(ctx.request, patchTemplateSchema);
  return json({ template: patchTemplate(docs, ctx.params.id as string, body) });
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  return json(deleteTemplate(docs, ctx.params.id as string));
});
