/** GET/POST /api/templates?wsId=&kind=. List and create (§3.6, §2.7). */
import { json, route } from "@/lib/api/errors";
import { HttpError } from "@/lib/api/errors";
import { paginate, pageParams } from "@/lib/api/paginate";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { createTemplateSchema } from "@/lib/validation/pages-templates";
import { requireDocs } from "@/lib/services/pages-access";
import { createTemplate, listTemplates } from "@/lib/services/templates";

type Ctx = { request: Request };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const url = new URL(ctx.request.url);
  const raw = url.searchParams.get("kind");
  if (raw !== null && raw !== "issue" && raw !== "page") {
    throw new HttpError("VALIDATION", "kind must be issue or page", [`kind: ${raw}`]);
  }
  const { limit } = pageParams(url);
  return json(paginate(listTemplates(docs, raw ?? undefined), url.searchParams.get("cursor"), limit));
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBody(ctx.request, createTemplateSchema);
  return json({ template: createTemplate(docs, body) }, 201);
});
