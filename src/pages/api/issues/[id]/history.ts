/** GET /api/issues/:id/history — property-change ledger. */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { pageParams, paginate } from "@/lib/api/paginate";
import { requireWsId } from "@/lib/services/issues-helpers";
import { listIssueHistory } from "@/lib/services/issues-history";
import { requireLiveIssue } from "@/lib/services/issues-scope";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  const url = new URL(ctx.request.url);
  const { limit } = pageParams(url);
  return json(paginate(listIssueHistory(issue.id), url.searchParams.get("cursor"), limit));
});
