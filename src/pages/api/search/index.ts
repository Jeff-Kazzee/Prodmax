/**
 * GET /api/search?wsId=&q=&types=issue,page,project (§3.6, FM-042).
 *
 * Not behind the Docs gate: §7 denies guests Docs and projects, but they may
 * still search the issues of their own teams. The narrowing happens inside
 * the service, which subtracts the types a guest cannot see before the index
 * is queried at all.
 */
import { json, route } from "@/lib/api/errors";
import { pageParams } from "@/lib/api/paginate";
import { requireWsId } from "@/lib/services/issues-helpers";
import { parseSearchTypes, searchEntities } from "@/lib/services/search";

type Ctx = { request: Request };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const url = new URL(ctx.request.url);
  const { limit } = pageParams(url);
  const result = searchEntities(ctx.request, {
    wsId,
    q: url.searchParams.get("q") ?? "",
    types: parseSearchTypes(url.searchParams.get("types")),
    cursor: url.searchParams.get("cursor"),
    limit,
  });
  return json(result);
});
