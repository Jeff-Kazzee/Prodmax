/** PATCH/DELETE /api/comments/:id — author-only body edit; resolve via PATCH. */
import { patchCommentSchema } from "@/lib/validation/issues";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { deleteComment, loadComment, patchComment } from "@/lib/services/comments";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const PATCH = route(async (ctx: Ctx) => {
  const row = loadComment(ctx.params.id as string);
  const { member } = requireWorkspace(ctx.request, row.workspaceId);
  const body = await parseBodyOptional(ctx.request, patchCommentSchema);
  return json({ comment: patchComment(member, row.id, body) });
});

export const DELETE = route(async (ctx: Ctx) => {
  const row = loadComment(ctx.params.id as string);
  const { member } = requireWorkspace(ctx.request, row.workspaceId);
  return json(deleteComment(member, row.id));
});
