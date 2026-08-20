/**
 * GET /api/pages/tree?wsId=&expanded=a,b. The sidebar tree (§3.6, §9).
 *
 * Path divergence, recorded rather than hidden. Architecture §3.6 and T-007
 * both write this as `GET /api/workspaces/:wsId/pages/tree`. That file would
 * be `src/pages/api/workspaces/[id]/pages/tree.ts`, which §8 assigns to M1 and
 * T-007's owns list does not cover, and §8's overlap rule says a module never
 * edits another's files.
 *
 * It is also the only path-embedded wsId in the whole API surface: every other
 * endpoint in §3 and every route in this codebase takes `?wsId=`. T-007's
 * acceptance constrains the tree *query shape* (visible nodes only, O(expanded))
 * and says nothing about the URL, so the shape is honoured here and the §3.6
 * row is flagged for a wording amendment in the ticket's work log.
 *
 * Astro resolves static segments before dynamic ones, so this coexists with
 * ./[id]/index.ts exactly as src/pages/api/issues/bulk.ts already coexists
 * with src/pages/api/issues/[id]/. A page id could never be "tree" in any case:
 * ids are uuid7.
 */
import { json, route } from "@/lib/api/errors";
import { requireWsId } from "@/lib/services/issues-helpers";
import { treeQuerySchema } from "@/lib/validation/pages";
import { requireDocs } from "@/lib/services/pages-access";
import { pageTree } from "@/lib/services/pages";
import { HttpError } from "@/lib/api/errors";

type Ctx = { request: Request };

export const GET = route(async (ctx: Ctx) => {
  const wsId = requireWsId(ctx.request);
  const docs = requireDocs(ctx.request, wsId);
  const raw = new URL(ctx.request.url).searchParams.get("expanded");
  const list = raw === null || raw.trim().length === 0 ? [] : raw.split(",").map((s) => s.trim()).filter(Boolean);
  // Parsed rather than trusted: the schema carries the id character class and
  // the 2,000-node cap, which a bare CSV split does not.
  const parsed = treeQuerySchema.safeParse({ expanded: list });
  if (!parsed.success) {
    throw new HttpError("VALIDATION", "Invalid expanded list", parsed.error.issues.map((i) => i.message));
  }
  return json({ data: pageTree(docs, parsed.data.expanded ?? []) });
});
