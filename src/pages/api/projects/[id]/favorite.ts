/**
 * POST /api/projects/:id/favorite?wsId= — toggle the caller's star (T-029).
 *
 * Mirrors the saved-view route's shape, and deliberately not its storage: a
 * star is per-user, so it is a row in `favorites` rather than a boolean on the
 * project. Returns the state after the write, so a caller never guesses.
 *
 * Any workspace member may star, including a guest. Starring is a personal
 * bookmark and changes nothing another member can see.
 */
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { requireWsId } from "@/lib/services/issues-helpers";
import { toggleProjectFavorite } from "@/lib/services/projects";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const POST = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);
  return json({ favorited: toggleProjectFavorite(wsId, member.userId, ctx.params.id as string) });
});
