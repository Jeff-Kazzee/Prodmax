/**
 * Page trash and restore (ux-spec DH-05 / PE-05, FM-050).
 *
 * The hard requirement is that restoring a page brings back exactly the
 * descendants *its own delete* took, and leaves alone any descendant that was
 * already in the trash beforehand. That needs a per-delete identity, and this
 * ticket cannot add a column: src/db/schema.ts is M1-owned and a migration
 * would have to serialize behind 0002_parallel_warhawk.sql.
 *
 * So the identity rides `deleted_at`. A trash operation stamps the root and
 * every *live* descendant with one value, allocated strictly greater than any
 * stamp already present in the workspace. Restore then matches on stamp
 * equality. A child trashed earlier carries a smaller stamp and stays
 * trashed; it is not merely unlikely to collide, it cannot.
 *
 * Allocating from `max(deleted_at) + 1` rather than from the clock is what
 * makes that exact. Two deletes in the same millisecond, or a clock that steps
 * backwards, would otherwise share a stamp and silently merge two cohorts.
 * The single-process synchronous driver makes the read-then-write safe, which
 * is the same argument §2.10 makes for issue-number allocation.
 */
import { and, asc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { pages } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import { TRASH_WINDOW_MS } from "@/lib/validation/pages";
import { descendantRange, requirePage, type DocsCtx, type PageRow } from "./pages-access";
import { movePage, toPageDto, type PageDto } from "./pages";

/**
 * The 30-day restore window (DH-05), as one predicate.
 *
 * The listing and the restore path each spelled this out and disagreed by one
 * millisecond at the exact boundary, where a page was absent from the trash
 * listing and still restorable.
 */
export function withinTrashWindow(deletedAt: number, now: number): boolean {
  return deletedAt + TRASH_WINDOW_MS > now;
}

/**
 * A stamp no earlier trash in this workspace has used.
 *
 * Bounded to stamps at or after `now`, so the scan cannot be dragged by an
 * ancient delete and the common case reads no rows at all.
 */
function allocateTrashStamp(ctx: DocsCtx, now: number): number {
  const row = currentDb()
    .select({ m: sql<number | null>`MAX(${pages.deletedAt})` })
    .from(pages)
    .where(and(eq(pages.workspaceId, ctx.wsId), gte(pages.deletedAt, now)))
    .get();
  const highest = row?.m ?? null;
  return highest === null ? now : highest + 1;
}

/**
 * Soft-delete a page and every live page beneath it.
 *
 * Idempotent: trashing an already-trashed page returns it untouched rather
 * than restamping it, which would detach it from its own cohort.
 */
export function trashPage(ctx: DocsCtx, id: string): PageDto {
  const page = requirePage(ctx, id);
  if (page.deletedAt !== null) return toPageDto(page);

  const now = Date.now();
  const { lo, hi } = descendantRange(page.path);
  currentDb().transaction(() => {
    const stamp = allocateTrashStamp(ctx, now);
    currentDb()
      .update(pages)
      .set({ deletedAt: stamp, updatedAt: now, updatedBy: ctx.userId })
      .where(
        and(
          eq(pages.workspaceId, ctx.wsId),
          isNull(pages.deletedAt),
          sql`(${pages.id} = ${page.id} OR (${pages.path} >= ${lo} AND ${pages.path} < ${hi}))`,
        ),
      )
      .run();
  });
  return toPageDto(requirePage(ctx, id));
}

/**
 * Restore a trashed page and exactly the cohort its delete took.
 *
 * A page whose parent is still trashed would be restored into a subtree the
 * user cannot see, so it is reparented to the root. The depth delta of that
 * move is never positive, so the depth cap cannot be breached by a restore.
 */
export function restorePage(ctx: DocsCtx, id: string): PageDto {
  const page = requirePage(ctx, id);
  if (page.deletedAt === null) return toPageDto(page);
  if (!withinTrashWindow(page.deletedAt, Date.now())) {
    throw new HttpError("NOT_FOUND", "The restore window for this page has closed");
  }

  const stamp = page.deletedAt;
  const { lo, hi } = descendantRange(page.path);
  const now = Date.now();
  currentDb().transaction(() => {
    currentDb()
      .update(pages)
      .set({ deletedAt: null, updatedAt: now, updatedBy: ctx.userId })
      .where(
        and(
          eq(pages.workspaceId, ctx.wsId),
          eq(pages.deletedAt, stamp),
          sql`(${pages.id} = ${page.id} OR (${pages.path} >= ${lo} AND ${pages.path} < ${hi}))`,
        ),
      )
      .run();
  });

  const restored = requirePage(ctx, id);
  const parent = restored.parentId === null ? null : requirePage(ctx, restored.parentId);
  if (parent !== null && parent.deletedAt !== null) {
    // Reparenting is a move, so it reuses the one path rewrite rather than
    // spelling a second one that could disagree with it.
    return movePage(ctx, id, { parentId: null });
  }
  return toPageDto(restored);
}

/**
 * The trash listing (ux-spec DH-05): one row per delete operation, not one
 * row per trashed page. A page is a cohort root when it has no parent, or
 * when its parent is live, or when its parent carries a different stamp,
 * which is exactly "this page was the thing someone deleted".
 *
 * Pages past the 30-day window are filtered rather than purged. Nothing in
 * this ticket runs on a schedule, and architecture §9 is explicit that a
 * backstop nothing can invoke is decoration; an operator purge belongs to the
 * M10 admin surface (T-019).
 */
export function listTrashedPages(ctx: DocsCtx): PageDto[] {
  const now = Date.now();
  const trashed = currentDb()
    .select()
    .from(pages)
    .where(and(eq(pages.workspaceId, ctx.wsId), isNotNull(pages.deletedAt)))
    .orderBy(asc(pages.deletedAt))
    .all()
    .filter((row) => row.deletedAt !== null && withinTrashWindow(row.deletedAt, now));

  const byId = new Map<string, PageRow>(trashed.map((r) => [r.id, r]));
  return trashed
    .filter((row) => {
      if (row.parentId === null) return true;
      const parent = byId.get(row.parentId);
      return parent === undefined || parent.deletedAt !== row.deletedAt;
    })
    .map(toPageDto);
}
