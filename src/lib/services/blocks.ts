/**
 * Blocks service (M5a, architecture §3.6 + the §9 page-open counter-design).
 *
 * The read is the load-bearing one. §9 replaces Notion's recursive
 * `loadPageChunk` crawl with a single ordered SELECT over the
 * (page_id, parent_id, position) index; the client builds the tree. So
 * `listPageBlocks` issues exactly one statement over `blocks`, and
 * tests/api/blocks pins that with a statement counter rather than a comment.
 *
 * Every write goes through ./blocks-write, which is the only module that
 * touches the table. The four write endpoints are all expressed as batches of
 * one, so nest rules, sanitization, positions and the page version bump have
 * exactly one implementation.
 */
import { and, eq, isNull } from "drizzle-orm";
import { blocks, pages, views } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import { childrenAllowed, sanitizeBlock, type SanitizedBlock } from "@/lib/validation/blocks";
import { MAX_BATCH_OPS, type BlockOp } from "@/lib/validation/blocks-ops";
import { requireLivePage, workspaceMentions, type DocsCtx } from "./pages-access";
import { touchPageAfterBlockWrite } from "./pages";
import {
  insertBlockRow,
  readPageBlockRows,
  resolvePlacement,
  siblingViewOf,
  softDeleteBlockRows,
  toBlockDto,
  updateBlockRow,
  type BlockDto,
  type BlockRow,
  type SiblingView,
} from "./blocks-write";

/**
 * The §9 page open. ONE statement over `blocks`.
 *
 * Ordering is done in SQL so the composite index does the work. Sorting in JS
 * would return the same array and would still look like one query, which is
 * why the counter test also asserts the statement text carries an ORDER BY.
 *
 * The result is flat and unpaginated. A cursor here would make the tree
 * unbuildable from one response, which is the recursion §9 exists to remove.
 * Note for consumers: (parent_id, position) is not a topological order, so the
 * client indexes by id and attaches in a second pass.
 */
export function listPageBlocks(ctx: DocsCtx, pageId: string): BlockDto[] {
  return readPageBlockRows(ctx, pageId).map(toBlockDto);
}

export interface BatchResult {
  blocks: BlockDto[];
  deleted: string[];
  pageVersion: number;
}

/**
 * Apply a list of ops to one page inside one transaction.
 *
 * Ops are applied in order against a live in-memory view of the page, so an
 * op may reference a block an earlier op inserted (ux-spec ED-07 pastes a
 * toggle and its children as one batch). Any throw leaves the transaction, and
 * better-sqlite3 rolls back every prior op, so a batch cannot half-apply.
 *
 * The transaction body is synchronous on purpose: better-sqlite3 refuses an
 * async one outright ("Transaction function cannot return a promise"), which
 * makes the "we awaited inside and silently lost atomicity" bug unwritable.
 */
export function applyBlockOps(
  ctx: DocsCtx,
  pageId: string,
  ops: readonly BlockOp[],
  /**
   * Prefix for error details. The batch endpoint sends "ops", so a caller sees
   * `ops[2].parentId`. The single-block endpoints send "block", because a
   * client that posted one block never sent an `ops` array and should not be
   * told which element of it was wrong.
   */
  label = "ops",
): BatchResult {
  if (ops.length > MAX_BATCH_OPS) {
    throw new HttpError("PAYLOAD_TOO_LARGE", `A batch carries at most ${MAX_BATCH_OPS} ops`, [
      `ops: ${ops.length}`,
    ]);
  }
  const page = requireLivePage(ctx, pageId);
  const mentions = workspaceMentions(ctx);
  const now = Date.now();

  return currentDb().transaction(() => {
    const rows = readPageBlockRows(ctx, pageId);
    const view = siblingViewOf(rows);
    const live = new Map<string, BlockRow>(rows.map((r) => [r.id, r]));
    const touched = new Set<string>();
    const deleted: string[] = [];

    ops.forEach((op, i) => {
      const at = label === "ops" ? `ops[${i}]` : label;
      switch (op.op) {
        case "insert": {
          const existing = live.get(op.id);
          const block = sanitizeBlock({ type: op.type, props: op.props }, mentions, at);
          assertBlockReferences(ctx, block, at);
          if (existing !== undefined) {
            // Replay convergence. ED-12 flushes the offline queue as one batch
            // on reconnect, so the same insert can legitimately arrive twice;
            // a 409 there would be data loss. Re-applying is idempotent.
            const updated = updateBlockRow(ctx, existing, block, null, now);
            live.set(updated.id, updated);
            // The view has to learn the new type too. Leaving it stale let a
            // later op in the same batch nest a child under what the view still
            // called a toggle after it had become a paragraph.
            const seenReplay = view.byId.get(updated.id);
            if (seenReplay) seenReplay.type = block.type;
            touched.add(updated.id);
            break;
          }
          // A soft-deleted row keeps its primary key, so `live` (which filters
          // deleted rows) does not see it and the insert used to collide on the
          // PK and 500. ux-spec ED-11 undo of a delete re-inserts under the
          // client's own id and §3.6 has no block restore endpoint, so this is
          // the only path back. Revive it instead.
          const buried = reviveDeletedBlock(ctx, op.id, pageId, at);
          if (buried !== undefined) {
            const placement = resolvePlacement(view, op, op.id, at);
            const revived = updateBlockRow(ctx, buried, block, placement, now, { restore: true });
            live.set(revived.id, revived);
            view.byId.set(revived.id, {
              id: revived.id,
              parentId: revived.parentId,
              type: block.type,
              position: revived.position,
            });
            syncView(view, placement);
            touched.add(revived.id);
            break;
          }
          assertUnclaimedId(ctx, op.id, pageId, at);
          const placement = resolvePlacement(view, op, undefined, at);
          const created = insertBlockRow(ctx, pageId, op.id, block, placement, now);
          live.set(created.id, created);
          view.byId.set(created.id, {
            id: created.id,
            parentId: created.parentId,
            type: block.type,
            position: created.position,
          });
          syncView(view, placement);
          touched.add(created.id);
          break;
        }
        case "update": {
          const row = requireOnPage(live, op.id, at);
          const type = op.type ?? row.type;
          const block = sanitizeBlock({ type, props: op.props }, mentions, at);
          assertBlockReferences(ctx, block, at);
          // Turn-into is the other side of the nest rule. `Placement` stops a
          // child being written under a leaf; it cannot stop the parent being
          // turned INTO a leaf while it still has children. ux-spec ED-06
          // offers exactly that conversion (toggle to paragraph), so without
          // this a valid UI action produced children parented to a paragraph.
          if (!childrenAllowed(block.type) && hasChildren(view, op.id)) {
            throw new HttpError("VALIDATION", `${block.type} blocks do not accept children`, [
              `${at}.type: ${block.type}`,
            ]);
          }
          const updated = updateBlockRow(ctx, row, block, null, now);
          live.set(updated.id, updated);
          const seen = view.byId.get(updated.id);
          if (seen) seen.type = block.type;
          touched.add(updated.id);
          break;
        }
        case "move": {
          const row = requireOnPage(live, op.id, at);
          const placement = resolvePlacement(view, op, op.id, at);
          const moved = updateBlockRow(ctx, row, null, placement, now);
          live.set(moved.id, moved);
          const seen = view.byId.get(moved.id);
          if (seen) {
            seen.parentId = placement.parentId;
            seen.position = placement.position;
          }
          syncView(view, placement);
          touched.add(moved.id);
          break;
        }
        case "delete": {
          if (!live.has(op.id)) {
            // Already gone. Deleting twice converges rather than 404ing, so a
            // replayed flush does not fail on work it already did.
            break;
          }
          for (const id of softDeleteBlockRows(ctx, view, op.id, now)) {
            live.delete(id);
            deleted.push(id);
            touched.delete(id);
          }
          break;
        }
      }
    });

    touchPageAfterBlockWrite(ctx, pageId, page.version, now);
    const after = readPageBlockRows(ctx, pageId);
    return {
      blocks: after.filter((r) => touched.has(r.id)).map(toBlockDto),
      deleted,
      pageVersion: page.version + 1,
    };
  });
}

function syncView(view: SiblingView, placement: { rebalance: ReadonlyArray<{ id: string; position: string }> }): void {
  for (const { id, position } of placement.rebalance) {
    const seen = view.byId.get(id);
    if (seen) seen.position = position;
  }
}

/**
 * Reference-bearing props must point at something real in this workspace.
 *
 * Section 2.6 types `issue_view.viewId` as an FK to views and `page_link.pageId`
 * as a page. Storing a dangling id turns a write-time error into a render-time
 * one for T-010's embed, which is the worse place to find it.
 */
function assertBlockReferences(ctx: DocsCtx, block: SanitizedBlock, at: string): void {
  const props = block.props as Record<string, unknown>;
  if (block.type === "issue_view") {
    const viewId = props.viewId as string;
    const found = currentDb()
      .select({ id: views.id })
      .from(views)
      .where(and(eq(views.workspaceId, ctx.wsId), eq(views.id, viewId)))
      .get();
    if (found === undefined) {
      throw new HttpError("VALIDATION", "viewId must be a view in this workspace", [`${at}.props.viewId: ${viewId}`]);
    }
  }
  if (block.type === "page_link") {
    const pageId = props.pageId as string;
    const found = currentDb()
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.workspaceId, ctx.wsId), eq(pages.id, pageId), isNull(pages.deletedAt)))
      .get();
    if (found === undefined) {
      throw new HttpError("VALIDATION", "pageId must be a live page in this workspace", [
        `${at}.props.pageId: ${pageId}`,
      ]);
    }
  }
}

/** True when any live block on the page is parented to `id`. */
function hasChildren(view: SiblingView, id: string): boolean {
  for (const b of view.byId.values()) if (b.parentId === id) return true;
  return false;
}

/**
 * A soft-deleted block on this page, if the id names one.
 *
 * Scoped to the caller's workspace and page: an id naming a deleted block
 * somewhere else is still a conflict, not something to quietly adopt.
 */
function reviveDeletedBlock(ctx: DocsCtx, id: string, pageId: string, at: string): BlockRow | undefined {
  const row = currentDb().select().from(blocks).where(eq(blocks.id, id)).get();
  if (row === undefined || row.deletedAt === null) return undefined;
  if (row.workspaceId !== ctx.wsId || row.pageId !== pageId) {
    throw new HttpError("CONFLICT", "Block id already exists elsewhere", [`${at}.id: ${id}`]);
  }
  return row;
}

function requireOnPage(live: Map<string, BlockRow>, id: string, at: string): BlockRow {
  const row = live.get(id);
  if (row === undefined) throw new HttpError("NOT_FOUND", "Block not found on this page", [`${at}.id: ${id}`]);
  return row;
}

/**
 * A client-chosen insert id must not already name a block elsewhere. Without
 * this an insert could silently adopt a block from another page, or worse,
 * from another workspace.
 */
function assertUnclaimedId(ctx: DocsCtx, id: string, pageId: string, at: string): void {
  const found = currentDb()
    .select({ pageId: blocks.pageId, workspaceId: blocks.workspaceId })
    .from(blocks)
    .where(eq(blocks.id, id))
    .get();
  if (found === undefined) return;
  if (found.workspaceId !== ctx.wsId || found.pageId !== pageId) {
    throw new HttpError("CONFLICT", "Block id already exists elsewhere", [`${at}.id: ${id}`]);
  }
}

/* Single-op wrappers. Each endpoint is a batch of one, so there is no second
 * implementation of the nest rule, the sanitizer or the position allocator. */

export interface CreateBlockInput {
  id?: string;
  type: string;
  /**
   * Optional in the type because `z.unknown()` admits `undefined`. A request
   * that omits props is still rejected, by the per-type schema in
   * validation/blocks, which names the missing field.
   */
  props?: unknown;
  parentId?: string | null;
  afterId?: string | null;
  beforeId?: string | null;
}

export function createBlock(ctx: DocsCtx, pageId: string, input: CreateBlockInput): BlockDto {
  const id = input.id ?? uuid7();
  const result = applyBlockOps(
    ctx,
    pageId,
    [
      {
        op: "insert",
        id,
        type: input.type,
        props: input.props,
        parentId: input.parentId,
        afterId: input.afterId,
        beforeId: input.beforeId,
      },
    ],
    "block",
  );
  const created = result.blocks.find((b) => b.id === id);
  if (created === undefined) throw new HttpError("INTERNAL", "Block was not created");
  return created;
}

/** Find the page a block belongs to, scoped to the caller's workspace. */
export function requireBlockPageId(ctx: DocsCtx, blockId: string, expectedVersion?: number): string {
  const row = currentDb()
    .select({
      pageId: blocks.pageId,
      workspaceId: blocks.workspaceId,
      deletedAt: blocks.deletedAt,
      version: blocks.version,
    })
    .from(blocks)
    .where(eq(blocks.id, blockId))
    .get();
  if (row === undefined || row.workspaceId !== ctx.wsId || row.deletedAt !== null) {
    throw new HttpError("NOT_FOUND", "Block not found");
  }
  if (expectedVersion !== undefined && row.version !== expectedVersion) {
    throw new HttpError("CONFLICT", "Version conflict", [
      `expectedVersion: ${expectedVersion}`,
      `actual: ${row.version}`,
    ]);
  }
  return row.pageId;
}

export interface PatchBlockInput {
  type?: string;
  props?: unknown;
  parentId?: string | null;
  afterId?: string | null;
  beforeId?: string | null;
}

/**
 * PATCH /api/blocks/:id. A props edit and a move are separate ops even when
 * one request carries both, so each goes through its own validation.
 */
export function patchBlock(
  ctx: DocsCtx,
  blockId: string,
  input: PatchBlockInput,
  expectedVersion?: number,
): BlockDto {
  const pageId = requireBlockPageId(ctx, blockId, expectedVersion);
  const ops: BlockOp[] = [];
  if (input.props !== undefined) {
    ops.push({ op: "update", id: blockId, type: input.type, props: input.props });
  }
  if (input.parentId !== undefined || input.afterId !== undefined || input.beforeId !== undefined) {
    ops.push({
      op: "move",
      id: blockId,
      parentId: input.parentId,
      afterId: input.afterId,
      beforeId: input.beforeId,
    });
  }
  if (ops.length === 0) throw new HttpError("VALIDATION", "Nothing to update", ["body: no recognised field"]);
  const result = applyBlockOps(ctx, pageId, ops, "block");
  const patched = result.blocks.find((b) => b.id === blockId);
  if (patched === undefined) throw new HttpError("INTERNAL", "Block was not updated");
  return patched;
}

/** DELETE /api/blocks/:id. Soft delete, children included. */
export function deleteBlock(ctx: DocsCtx, blockId: string, expectedVersion?: number): { deleted: string[] } {
  const pageId = requireBlockPageId(ctx, blockId, expectedVersion);
  return { deleted: applyBlockOps(ctx, pageId, [{ op: "delete", id: blockId }], "block").deleted };
}
