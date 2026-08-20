/**
 * Page request schemas (architecture §2.6, §3.6).
 *
 * `path` and `depth` are never accepted from a client. Both are derived from
 * the parent at write time (§2.6 makes `path` a materialized `/parentPath/id`
 * and caps `depth` at 20), so letting a client send either would let it
 * describe a tree that does not exist.
 *
 * Reordering and reparenting both ride PATCH, because §3.6 lists no separate
 * move route. Placement is intent (`afterId`/`beforeId`), never a position
 * key, matching the blocks contract in ./blocks-ops.
 */
import { z } from "zod";

/** §2.6: depth is capped at 20. Enforced on create and on move. */
export const MAX_PAGE_DEPTH = 20;

/** ux-spec DH-05 / FM-050: a trashed page is restorable for 30 days. */
export const TRASH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "id must be url-safe");

/**
 * Emoji, per §2.6. Length is capped rather than pattern-matched: a codepoint
 * class strict enough to bless every emoji sequence and reject everything else
 * does not exist, and rejecting a valid flag or family emoji is worse than
 * storing a short string.
 */
const iconSchema = z.string().max(16).nullable();

export const createPageSchema = z
  .object({
    parentId: idSchema.nullable().optional(),
    title: z.string().max(512).optional(),
    icon: iconSchema.optional(),
    afterId: idSchema.nullable().optional(),
    beforeId: idSchema.nullable().optional(),
  })
  .strict();

export const patchPageSchema = z
  .object({
    title: z.string().max(512).optional(),
    icon: iconSchema.optional(),
    archived: z.boolean().optional(),
    parentId: idSchema.nullable().optional(),
    afterId: idSchema.nullable().optional(),
    beforeId: idSchema.nullable().optional(),
  })
  .strict();

export type CreatePageInput = z.infer<typeof createPageSchema>;
export type PatchPageInput = z.infer<typeof patchPageSchema>;

/**
 * The tree query (§3.6, §9). The sidebar renders visible nodes only, so the
 * caller names the expanded nodes and gets their children plus the roots.
 * Depth 20 and a wide fan-out still fit well inside the cap.
 */
export const treeQuerySchema = z
  .object({ expanded: z.array(idSchema).max(2_000).optional() })
  .strict();

/** A move is a reparent, a reorder, or both. Used by the service, not a route. */
export interface MoveIntent {
  parentId: string | null;
  afterId: string | null;
  beforeId: string | null;
}
