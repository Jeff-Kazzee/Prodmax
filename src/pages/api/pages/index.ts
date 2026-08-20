/** GET/POST /api/pages?wsId=. List (or trash listing) and create (§3.6). */
import { json, route } from "@/lib/api/errors";
import { paginate, pageParams } from "@/lib/api/paginate";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { createPageSchema } from "@/lib/validation/pages";
import { requireDocs } from "@/lib/services/pages-access";
import { createPage, listPages } from "@/lib/services/pages";
import { listTrashedPages } from "@/lib/services/pages-trash";

type Ctx = { request: Request };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  // ?trashed=true is the DH-05 restore surface, which lists one row per delete
  // operation rather than every trashed page.
  const url = new URL(ctx.request.url);
  const trashed = url.searchParams.get("trashed") === "true";
  const rows = trashed ? listTrashedPages(docs) : listPages(docs);
  const { limit } = pageParams(url);
  return json(paginate(rows, url.searchParams.get("cursor"), limit));
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBody(ctx.request, createPageSchema);
  return json({ page: createPage(docs, body) }, 201);
});
