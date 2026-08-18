/** POST /api/issues/bulk — batch property edits, one undo token. */
import { bulkIssueSchema } from "@/lib/validation/issues";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { bulkUpdateIssues } from "@/lib/services/issues-bulk";
import { requireWsId } from "@/lib/services/issues-helpers";

export const POST = route(async (ctx: { request: Request }) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const body = await parseBody(ctx.request, bulkIssueSchema);
  return json(bulkUpdateIssues(wsId, member, body));
});
