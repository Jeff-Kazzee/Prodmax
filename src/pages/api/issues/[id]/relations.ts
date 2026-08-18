/** POST/DELETE /api/issues/:id/relations */
import { relationBodySchema, relationTypeSchema } from "@/lib/validation/issues";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { requireWsId } from "@/lib/services/issues-helpers";
import { addRelation, listRelations, removeRelation } from "@/lib/services/issues-relations";
import { requireLiveIssue } from "@/lib/services/issues-scope";
import { z } from "zod";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  return json({ data: listRelations(issue.id), nextCursor: null });
});

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  const body = await parseBody(ctx.request, relationBodySchema);
  return json({ relation: addRelation(wsId, issue, body.relatedIssueId, body.type, member) }, 201);
});

const deleteSchema = z.object({
  relatedIssueId: z.string().min(1),
  type: relationTypeSchema,
});

export const DELETE = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  const issue = requireLiveIssue(wsId, ctx.params.id as string, member.role, member.userId);
  const url = new URL(ctx.request.url);
  const parsed = deleteSchema.safeParse({
    relatedIssueId: url.searchParams.get("relatedIssueId"),
    type: url.searchParams.get("type"),
  });
  if (!parsed.success) throw new HttpError("VALIDATION", "relatedIssueId and type are required");
  removeRelation(issue, parsed.data.relatedIssueId, parsed.data.type, member.userId);
  return json({ ok: true });
});
