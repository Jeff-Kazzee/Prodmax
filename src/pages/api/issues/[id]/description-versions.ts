/** GET /api/issues/:id/description-versions; POST restore {versionId}. */
import { z } from "zod";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { latestIssue, requireWsId } from "@/lib/services/issues-helpers";
import { listDescriptionVersions, restoreDescriptionVersion } from "@/lib/services/issues-history";
import { requireLiveIssue } from "@/lib/services/issues-scope";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const restoreSchema = z.object({ versionId: z.string().min(1) });

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  return json({ data: listDescriptionVersions(issue.id), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  const body = await parseBody(ctx.request, restoreSchema);
  const now = Date.now();
  restoreDescriptionVersion(issue, body.versionId, member.userId, now);
  return json({ issue: latestIssue(issue.id) });
});
