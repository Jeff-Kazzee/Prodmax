/**
 * The only module that writes the `blocks` table.
 *
 * Four endpoints create or change blocks (POST, PATCH, DELETE, batch) and a
 * fifth path clones them from a template. Each of them owes the same four
 * things: sanitized props, a derived `text` column, the §2.6 nest rule, and a
 * server-assigned position. Spelling those four out per endpoint is how one of
 * them eventually forgets, so they are spelled out once, here.
 *
 * Two branded types make that structural rather than conventional:
 *   SanitizedBlock  (validation/blocks) cannot be built without sanitizing
 *   Placement       cannot be built without passing the nest rule
 * `insertBlockRow` and `updateBlockRow` take both, so a caller holding raw
 * client input has nothing it can pass. tests/api/blocks-choke-point covers
 * the remaining hole: a caller that skips this module and writes the table
 * directly.
 *
 * The FTS body needs no hook here. src/db/fts.sql maintains the page's index
 * row from `UPDATE OF text, page_id, workspace_id, deleted_at ON blocks`, so
 * deriving `text` inside the sanitizer is what keeps search correct.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { blocks } from "@/db/schema";
import { insertPosition } from "@/db/positions";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import { childrenAllowed, isBlockType, type BlockType, type SanitizedBlock } from "@/lib/validation/blocks";
import type { DocsCtx } from "./pages-access";

export type BlockRow = typeof blocks.$inferSelect;

export interface BlockDto {
  id: string;
  pageId: string;
  parentId: string | null;
  type: BlockType;
  props: unknown;
  position: string;
  text: string;
  version: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * `props` is stored as a JSON string. A row whose JSON is unreadable is a
 * corrupt row, not a reason to 500 an entire page open, so it degrades to an
 * empty object and the block still renders with its text.
 */
export function toBlockDto(row: BlockRow): BlockDto {
  let props: unknown = {};
  try {
    props = JSON.parse(row.props) as unknown;
  } catch {
    /* corrupt props degrade to {} rather than failing the page */
  }
  return {
    id: row.id,
    pageId: row.pageId,
    parentId: row.parentId,
    type: isBlockType(row.type) ? row.type : "paragraph",
    props,
    position: row.position,
    text: row.text,
    version: row.version,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

declare const PLACEMENT: unique symbol;

/**
 * A parent and a position that have passed the §2.6 nest rule. Only
 * `resolvePlacement` builds one, so no write can set a parent without the
 * check having run.
 */
export interface Placement {
  readonly [PLACEMENT]: true;
  readonly parentId: string | null;
  readonly position: string;
  /** Siblings to re-space in the same transaction (§2.10 rebalance). */
  readonly rebalance: ReadonlyArray<{ id: string; position: string }>;
}

/** A view of a page's live blocks, used to resolve placement without re-reading. */
export interface SiblingView {
  /** Every live block on the page, by id. Includes blocks inserted earlier in a batch. */
  byId: Map<string, { id: string; parentId: string | null; type: BlockType; position: string }>;
}

/**
 * The one place a Placement is constructed. The brand is a phantom property
 * with no runtime value, so the cast is unavoidable; keeping it in a single
 * private function keeps it from spreading to every call site.
 */
function brandPlacement(value: {
  parentId: string | null;
  position: string;
  rebalance: ReadonlyArray<{ id: string; position: string }>;
}): Placement {
  return value as unknown as Placement;
}

export function siblingViewOf(rows: readonly BlockRow[]): SiblingView {
  const byId = new Map<string, { id: string; parentId: string | null; type: BlockType; position: string }>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      parentId: r.parentId,
      type: isBlockType(r.type) ? r.type : "paragraph",
      position: r.position,
    });
  }
  return { byId };
}

/**
 * Enforce §2.6's "children allowed" column and turn placement intent into a
 * fractional key.
 *
 * `excludeId` drops a moving block from its own sibling list, so replaying a
 * move computes the same key rather than drifting one slot each time.
 */
export function resolvePlacement(
  view: SiblingView,
  intent: { parentId?: string | null; afterId?: string | null; beforeId?: string | null },
  excludeId?: string,
  at = "block",
): Placement {
  const parentId = intent.parentId ?? null;
  if (parentId !== null) {
    const parent = view.byId.get(parentId);
    if (parent === undefined) {
      throw new HttpError("VALIDATION", "Parent block is not on this page", [`${at}.parentId: ${parentId}`]);
    }
    if (!childrenAllowed(parent.type)) {
      throw new HttpError("VALIDATION", `${parent.type} blocks do not accept children`, [
        `${at}.parentId: ${parentId}`,
      ]);
    }
    // Cycle detection. Rejecting only `parentId === excludeId` catches
    // self-parenting and misses the real case: moving a block under its own
    // descendant. That produced a two-block ring that no client tree could
    // render and no delete could remove, because the subtree walk below had no
    // termination condition. Walk the ancestor chain of the target instead.
    if (excludeId !== undefined) {
      const seen = new Set<string>();
      for (let id: string | null = parentId; id !== null; id = view.byId.get(id)?.parentId ?? null) {
        if (id === excludeId) {
          throw new HttpError("CONFLICT", "A block cannot be moved into its own subtree", [
            `${at}.parentId: ${parentId}`,
          ]);
        }
        // A ring already in the table must not spin here either.
        if (seen.has(id)) break;
        seen.add(id);
      }
    }
  }

  const rows = [...view.byId.values()]
    .filter((b) => b.parentId === parentId && b.id !== excludeId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

  let index = rows.length;
  if (intent.afterId) {
    const found = rows.findIndex((r) => r.id === intent.afterId);
    if (found < 0) throw new HttpError("VALIDATION", "afterId is not a sibling", [`${at}.afterId: ${intent.afterId}`]);
    index = found + 1;
  } else if (intent.beforeId) {
    const found = rows.findIndex((r) => r.id === intent.beforeId);
    if (found < 0) {
      throw new HttpError("VALIDATION", "beforeId is not a sibling", [`${at}.beforeId: ${intent.beforeId}`]);
    }
    index = found;
  }

  const result = insertPosition(rows.map((r) => r.position), index);
  if (!result.rebalance) {
    return brandPlacement({ parentId, position: result.position, rebalance: [] });
  }
  const ordered = [...rows.slice(0, index), null, ...rows.slice(index)];
  const rebalance = ordered
    .map((row, i) => (row === null ? null : { id: row.id, position: result.rebalance![i] }))
    .filter((r): r is { id: string; position: string } => r !== null);
  return brandPlacement({ parentId, position: result.position, rebalance });
}

/** Live blocks of a page, ordered as §9 requires. One statement. */
export function readPageBlockRows(ctx: DocsCtx, pageId: string): BlockRow[] {
  return currentDb()
    .select()
    .from(blocks)
    .where(and(eq(blocks.workspaceId, ctx.wsId), eq(blocks.pageId, pageId), isNull(blocks.deletedAt)))
    .orderBy(asc(blocks.parentId), asc(blocks.position))
    .all();
}

function applyRebalance(placement: Placement): void {
  for (const { id, position } of placement.rebalance) {
    currentDb().update(blocks).set({ position }).where(eq(blocks.id, id)).run();
  }
}

/**
 * Insert one block. Callers must already be inside a transaction when more
 * than one write has to land together.
 */
export function insertBlockRow(
  ctx: DocsCtx,
  pageId: string,
  id: string,
  block: SanitizedBlock,
  placement: Placement,
  now: number,
): BlockRow {
  applyRebalance(placement);
  currentDb()
    .insert(blocks)
    .values({
      id,
      workspaceId: ctx.wsId,
      pageId,
      parentId: placement.parentId,
      type: block.type,
      props: JSON.stringify(block.props),
      position: placement.position,
      text: block.text,
      version: 1,
      deletedAt: null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return currentDb().select().from(blocks).where(eq(blocks.id, id)).get()!;
}

/** Update one block's content, its placement, or both. */
export function updateBlockRow(
  ctx: DocsCtx,
  row: BlockRow,
  block: SanitizedBlock | null,
  placement: Placement | null,
  now: number,
  opts: { restore?: boolean } = {},
): BlockRow {
  const patch: Partial<typeof blocks.$inferInsert> = {
    version: row.version + 1,
    updatedAt: now,
    updatedBy: ctx.userId,
  };
  // Clearing deleted_at also re-fires the fts.sql block trigger, which rebuilds
  // the page's search body from its live blocks.
  if (opts.restore) patch.deletedAt = null;
  if (block !== null) {
    patch.type = block.type;
    patch.props = JSON.stringify(block.props);
    // Always rewritten alongside props. fts.sql fires on `UPDATE OF text`, so
    // skipping it when only props changed would leave the page's index stale.
    patch.text = block.text;
  }
  if (placement !== null) {
    applyRebalance(placement);
    patch.parentId = placement.parentId;
    patch.position = placement.position;
  }
  currentDb().update(blocks).set(patch).where(eq(blocks.id, row.id)).run();
  return currentDb().select().from(blocks).where(eq(blocks.id, row.id)).get()!;
}

/**
 * Soft-delete a block and its descendants.
 *
 * The subtree is walked in memory from the page's already-loaded rows rather
 * than with a recursive query, because block nesting is at most a few levels
 * and the rows are in hand.
 */
export function softDeleteBlockRows(ctx: DocsCtx, view: SiblingView, rootId: string, now: number): string[] {
  const doomed: string[] = [];
  // The visited set is not defensive padding. Without it a parent ring in the
  // table makes this walk never terminate: it queued forever and died on
  // `RangeError: Invalid array length` after burning 7.5 seconds of one core,
  // on a request that could never succeed. `resolvePlacement` now refuses to
  // create such a ring, but a row that predates that fix must still be
  // deletable rather than able to spend a core.
  const visited = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    doomed.push(id);
    for (const b of view.byId.values()) if (b.parentId === id) queue.push(b.id);
  }
  for (const id of doomed) {
    currentDb()
      .update(blocks)
      .set({ deletedAt: now, updatedAt: now, updatedBy: ctx.userId })
      .where(and(eq(blocks.workspaceId, ctx.wsId), eq(blocks.id, id)))
      .run();
    view.byId.delete(id);
  }
  return doomed;
}
