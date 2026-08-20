/**
 * Pages service (M5a, architecture §2.6/§3.6/§9).
 *
 * `path` is the materialized `/parentPath/id` §2.6 specifies, and it is what
 * makes the two hard operations cheap: cycle detection is a string prefix
 * test on an already-loaded row, and moving a subtree is one UPDATE over an
 * index range rather than a walk. Both `path` and `depth` are derived here and
 * never accepted from a client.
 *
 * The sidebar contract (§9, "sidebar renders visible nodes only") is served by
 * `pageTree`, which asks for the roots plus the children of the nodes the
 * caller says are expanded. It is O(visible), not O(tree).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { pages } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { insertPosition } from "@/db/positions";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import {
  MAX_PAGE_DEPTH,
  TRASH_WINDOW_MS,
  type CreatePageInput,
  type PatchPageInput,
} from "@/lib/validation/pages";
import { descendantRange, requireLivePage, requirePage, type DocsCtx, type PageRow } from "./pages-access";

export interface PageDto {
  id: string;
  parentId: string | null;
  path: string;
  title: string;
  icon: string | null;
  position: string;
  depth: number;
  version: number;
  creatorId: string;
  updatedBy: string | null;
  archivedAt: number | null;
  deletedAt: number | null;
  /** When the 30-day trash window closes. Null while the page is live. */
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export function toPageDto(row: PageRow): PageDto {
  return {
    id: row.id,
    parentId: row.parentId,
    path: row.path,
    title: row.title,
    icon: row.icon,
    position: row.position,
    depth: row.depth,
    version: row.version,
    creatorId: row.creatorId,
    updatedBy: row.updatedBy,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    expiresAt: row.deletedAt === null ? null : row.deletedAt + TRASH_WINDOW_MS,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Live siblings under `parentId`, in visual order. */
function siblings(ctx: DocsCtx, parentId: string | null): PageRow[] {
  return currentDb()
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.workspaceId, ctx.wsId),
        parentId === null ? isNull(pages.parentId) : eq(pages.parentId, parentId),
        isNull(pages.deletedAt),
      ),
    )
    .orderBy(asc(pages.position))
    .all();
}

/**
 * Turn placement intent into a fractional key (§2.10: the client sends
 * "after X before Y", the server computes the key).
 *
 * `excludeId` drops the moving node from its own sibling list, which is what
 * makes replaying a move a fixed point rather than a drift.
 */
function placeAmongSiblings(
  ctx: DocsCtx,
  parentId: string | null,
  intent: { afterId?: string | null; beforeId?: string | null },
  excludeId?: string,
): { position: string; rebalance?: Array<{ id: string; position: string }> } {
  const rows = siblings(ctx, parentId).filter((r) => r.id !== excludeId);
  let index = rows.length; // default: append
  if (intent.afterId) {
    const at = rows.findIndex((r) => r.id === intent.afterId);
    if (at < 0) throw new HttpError("VALIDATION", "afterId is not a sibling", [`afterId: ${intent.afterId}`]);
    index = at + 1;
  } else if (intent.beforeId) {
    const at = rows.findIndex((r) => r.id === intent.beforeId);
    if (at < 0) throw new HttpError("VALIDATION", "beforeId is not a sibling", [`beforeId: ${intent.beforeId}`]);
    index = at;
  }
  const result = insertPosition(rows.map((r) => r.position), index);
  if (!result.rebalance) return { position: result.position };
  // §2.10: a midpoint past 24 chars re-spaces every sibling in one transaction.
  const ordered = [...rows.slice(0, index).map((r) => r.id), "__new__", ...rows.slice(index).map((r) => r.id)];
  const rebalance = ordered
    .map((id, i) => ({ id, position: result.rebalance![i] }))
    .filter((r) => r.id !== "__new__");
  return { position: result.position, rebalance };
}

function applyRebalance(rebalance: Array<{ id: string; position: string }> | undefined): void {
  if (!rebalance) return;
  for (const { id, position } of rebalance) {
    currentDb().update(pages).set({ position }).where(eq(pages.id, id)).run();
  }
}

/** Depth of the deepest row in this page's subtree, the node included. */
function deepestInSubtree(ctx: DocsCtx, page: PageRow): number {
  const { lo, hi } = descendantRange(page.path);
  const row = currentDb()
    .select({ d: sql<number>`COALESCE(MAX(${pages.depth}), 0)`.mapWith(Number) })
    .from(pages)
    .where(
      and(
        eq(pages.workspaceId, ctx.wsId),
        sql`(${pages.id} = ${page.id} OR (${pages.path} >= ${lo} AND ${pages.path} < ${hi}))`,
      ),
    )
    .get();
  return row?.d ?? page.depth;
}

/**
 * Optimistic concurrency. Architecture section 3 is binding: every mutating
 * endpoint accepts `?expectedVersion=` where the entity is versioned, and a
 * mismatch is 409 CONFLICT (FM-090). Mirrors `assertExpectedVersion` in the
 * issues module.
 */
export function assertPageVersion(page: PageRow, expected: number | undefined): void {
  if (expected !== undefined && page.version !== expected) {
    throw new HttpError("CONFLICT", "Version conflict", [`expectedVersion: ${expected}`, `actual: ${page.version}`]);
  }
}

function assertDepth(depth: number): void {
  if (depth > MAX_PAGE_DEPTH) {
    throw new HttpError("VALIDATION", `Page depth cap is ${MAX_PAGE_DEPTH}`, [`depth: ${depth}`]);
  }
}

export function createPage(ctx: DocsCtx, input: CreatePageInput): PageDto {
  const parent = input.parentId ? requireLivePage(ctx, input.parentId) : null;
  const depth = parent ? parent.depth + 1 : 0;
  assertDepth(depth);
  const id = uuid7();
  const now = Date.now();
  const placement = placeAmongSiblings(ctx, parent?.id ?? null, input);
  currentDb().transaction(() => {
    applyRebalance(placement.rebalance);
    currentDb()
      .insert(pages)
      .values({
        id,
        workspaceId: ctx.wsId,
        parentId: parent?.id ?? null,
        path: parent ? `${parent.path}/${id}` : `/${id}`,
        title: input.title ?? "",
        icon: input.icon ?? null,
        creatorId: ctx.userId,
        position: placement.position,
        depth,
        version: 1,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        updatedBy: ctx.userId,
      })
      .run();
  });
  return toPageDto(requirePage(ctx, id));
}

/**
 * Bump a page's version and updated_at after its blocks changed.
 *
 * Lives here rather than in the blocks service so that every write to the
 * `pages` table stays inside the two page modules, which
 * tests/api/blocks-choke-point asserts. It also re-fires the fts.sql page
 * trigger, which rebuilds the page's search body from its live blocks.
 */
export function touchPageAfterBlockWrite(ctx: DocsCtx, pageId: string, fromVersion: number, now: number): void {
  currentDb()
    .update(pages)
    .set({ version: fromVersion + 1, updatedAt: now, updatedBy: ctx.userId })
    .where(eq(pages.id, pageId))
    .run();
}

export function getPage(ctx: DocsCtx, id: string): PageDto {
  return toPageDto(requirePage(ctx, id));
}

/**
 * Live pages in the workspace, ordered as the tree reads them.
 *
 * Trashed pages are a separate listing (`listTrashedPages` in ./pages-trash),
 * because DH-05 renders them as a restore surface rather than as documents.
 */
export function listPages(ctx: DocsCtx): PageDto[] {
  return currentDb()
    .select()
    .from(pages)
    .where(and(eq(pages.workspaceId, ctx.wsId), isNull(pages.deletedAt)))
    .orderBy(asc(pages.path))
    .all()
    .map(toPageDto);
}

export interface TreeNodeDto extends PageDto {
  /** Lets the sidebar draw a chevron without fetching the children (§9). */
  hasChildren: boolean;
}

/**
 * The sidebar tree (§3.6, §9): roots, plus the children of every expanded
 * node. Two queries regardless of tree size, and the row count is the number
 * of nodes actually visible.
 */
export function pageTree(ctx: DocsCtx, expanded: readonly string[]): TreeNodeDto[] {
  const expandedIds = [...new Set(expanded)];
  const visible = currentDb()
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.workspaceId, ctx.wsId),
        isNull(pages.deletedAt),
        expandedIds.length === 0
          ? isNull(pages.parentId)
          : sql`(${pages.parentId} IS NULL OR ${inArray(pages.parentId, expandedIds)})`,
      ),
    )
    .orderBy(asc(pages.position))
    .all();

  // Scoped to the visible ids. Asking which parents have children across the
  // whole workspace made the second statement O(all live pages) while the
  // response stayed O(visible), which is not the budget section 9 sets.
  const visibleIds = visible.map((row) => row.id);
  const parentsWithChildren = new Set(
    visibleIds.length === 0
      ? []
      : currentDb()
          .selectDistinct({ parentId: pages.parentId })
          .from(pages)
          .where(
            and(
              eq(pages.workspaceId, ctx.wsId),
              isNull(pages.deletedAt),
              inArray(pages.parentId, visibleIds),
            ),
          )
          .all()
          .map((r) => r.parentId)
          .filter((p): p is string => p !== null),
  );

  return visible.map((row) => ({ ...toPageDto(row), hasChildren: parentsWithChildren.has(row.id) }));
}

/** True when `candidate` is the page itself or lives inside its subtree. */
function wouldCycle(page: PageRow, candidate: PageRow): boolean {
  return candidate.id === page.id || candidate.path.startsWith(`${page.path}/`);
}

/**
 * Move a page, carrying its whole subtree.
 *
 * Every descendant keeps its position relative to the moved node: its path
 * has the old ancestor prefix swapped for the new one, and its depth shifts
 * by the same delta. Both happen in one UPDATE over the path range, so a
 * descendant cannot end up with a new path and an old depth.
 *
 * Idempotent. Replaying a move recomputes the same prefix and a delta of 0,
 * so the UPDATE is a fixed point even without the early return below.
 */
export function movePage(
  ctx: DocsCtx,
  id: string,
  intent: { parentId?: string | null; afterId?: string | null; beforeId?: string | null },
  /** Metadata written in the same UPDATE, so one PATCH bumps `version` once. */
  extra: Partial<typeof pages.$inferInsert> = {},
): PageDto {
  const page = requireLivePage(ctx, id);
  const nextParentId = intent.parentId === undefined ? page.parentId : intent.parentId;
  const parent = nextParentId === null ? null : requireLivePage(ctx, nextParentId);

  // Cycle detection is a prefix test on the materialized path: no recursion,
  // no CTE, and the only row it needs is already loaded.
  if (parent && wouldCycle(page, parent)) {
    throw new HttpError("CONFLICT", "A page cannot be moved into its own subtree", [`parentId: ${parent.id}`]);
  }

  const newDepth = parent ? parent.depth + 1 : 0;
  const delta = newDepth - page.depth;
  // The cap applies to the deepest descendant, not to the node being dragged.
  assertDepth(deepestInSubtree(ctx, page) + delta);

  const newPath = parent ? `${parent.path}/${page.id}` : `/${page.id}`;
  const placement = placeAmongSiblings(ctx, nextParentId, intent, page.id);
  const now = Date.now();

  // A move that changes nothing writes nothing. Without this the row still got
  // a version bump, so replaying the identical move was a fixed point in path,
  // depth and position but not in `version`, which is the optimistic-concurrency
  // key an offline client compares against. Skipped when a rebalance is due,
  // since that has siblings to re-space regardless.
  const unchanged =
    nextParentId === page.parentId &&
    newPath === page.path &&
    placement.position === page.position &&
    (placement.rebalance === undefined || placement.rebalance.length === 0) &&
    Object.keys(extra).length === 0;
  if (unchanged) return toPageDto(page);

  currentDb().transaction(() => {
    applyRebalance(placement.rebalance);
    if (delta !== 0 || newPath !== page.path) {
      const { lo, hi } = descendantRange(page.path);
      // substr() is 1-based, so +1 lands just past the old prefix.
      currentDb().run(sql`
        UPDATE pages
           SET path = ${newPath} || substr(path, ${page.path.length + 1}),
               depth = depth + ${delta},
               updated_at = ${now},
               updated_by = ${ctx.userId}
         WHERE workspace_id = ${ctx.wsId}
           AND path >= ${lo} AND path < ${hi}`);
    }
    currentDb()
      .update(pages)
      .set({
        ...extra,
        parentId: nextParentId,
        path: newPath,
        depth: newDepth,
        position: placement.position,
        version: page.version + 1,
        updatedAt: now,
        updatedBy: ctx.userId,
      })
      .where(eq(pages.id, page.id))
      .run();
  });

  return toPageDto(requirePage(ctx, id));
}

/**
 * PATCH /api/pages/:id. Metadata edits, archive, and move.
 *
 * §3.6 lists no separate move route, so reparenting and reordering ride here
 * and delegate to `movePage` when placement intent is present.
 */
export function patchPage(ctx: DocsCtx, id: string, input: PatchPageInput, expectedVersion?: number): PageDto {
  const page = requireLivePage(ctx, id);
  assertPageVersion(page, expectedVersion);
  const moving = input.parentId !== undefined || input.afterId !== undefined || input.beforeId !== undefined;

  const patch: Partial<typeof pages.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.archived !== undefined) patch.archivedAt = input.archived ? Date.now() : null;

  // One transaction for the whole request. The metadata UPDATE used to run
  // outside one, so a PATCH carrying a rename and a rejected move committed the
  // rename and still returned an error. better-sqlite3 turns the inner
  // transaction in movePage into a SAVEPOINT, so nesting is safe.
  return currentDb().transaction(() => {
    // A move rewrites the same row, so folding the metadata into it keeps one
    // UPDATE and therefore one version bump per request.
    if (moving) return movePage(ctx, id, input, patch);
    if (Object.keys(patch).length > 0) {
      const now = Date.now();
      currentDb()
        .update(pages)
        .set({ ...patch, version: page.version + 1, updatedAt: now, updatedBy: ctx.userId })
        .where(eq(pages.id, page.id))
        .run();
    }
    return toPageDto(requirePage(ctx, id));
  });
}
