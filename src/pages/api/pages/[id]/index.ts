/**
 * GET/PATCH/DELETE /api/pages/:id?wsId= (§3.6).
 *
 * GET returns a trashed page rather than 404ing it, because ux-spec PE-05
 * deep-links to one and renders a restore card with the days remaining.
 * DELETE is the 30-day soft delete; restore lives at ./restore.
 */
import { json, route } from "@/lib/api/errors";
import { parseBodyOptional } from "@/lib/api/parse";
import { expectedVersionOf, requireWsId } from "@/lib/services/issues-helpers";
import { patchPageSchema } from "@/lib/validation/pages";
import { requireDocs } from "@/lib/services/pages-access";
import { getPage, patchPage } from "@/lib/services/pages";
import { trashPage } from "@/lib/services/pages-trash";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  return json({ page: getPage(docs, ctx.params.id as string) });
});

export const PATCH = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const body = await parseBodyOptional(ctx.request, patchPageSchema);
  return json({ page: patchPage(docs, ctx.params.id as string, body, expectedVersionOf(ctx.request)) });
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  return json({ page: trashPage(docs, ctx.params.id as string) });
});
