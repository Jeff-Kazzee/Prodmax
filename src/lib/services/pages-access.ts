/**
 * The Docs gate (architecture §7, binding).
 *
 * §7: guests get "no Docs access in v1 (pages/blocks API returns 403 for
 * guests)". That is a 403, not the 404 the issues services return for
 * out-of-scope teams, because a guest is not being told a page does not
 * exist, they are being told Docs is not theirs.
 *
 * The rule is carried by a branded token rather than by a function every
 * endpoint must remember to call. `requireDocs` is the only constructor of
 * `DocsCtx`, and every pages/blocks/templates service takes one as its first
 * parameter, so a route that skips the gate does not typecheck. A guard that
 * must be called is a guard that can be forgotten; this one cannot be.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { issues, pages, workspaceMembers } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import { requireWorkspace, type Role } from "@/lib/api/guards";
import type { MentionResolver, MentionTarget } from "@/lib/validation/blocks-richtext";

declare const DOCS_CTX: unique symbol;

/** Proof the §7 Docs gate ran. Only `requireDocs` can build one. */
export interface DocsCtx {
  readonly [DOCS_CTX]: true;
  readonly wsId: string;
  readonly userId: string;
  /** Guests never reach a service, so the type says so. */
  readonly role: Exclude<Role, "guest">;
}

export type PageRow = typeof pages.$inferSelect;

/**
 * Resolve membership, then refuse guests. `minRole` is passed through for
 * endpoints that need more than membership; Docs writes are a member
 * capability per §7's matrix, and members are already the floor here.
 */
export function requireDocs(request: Request, wsId: string, minRole?: Role): DocsCtx {
  const { member } = requireWorkspace(request, wsId, minRole);
  if (member.role === "guest") {
    throw new HttpError("FORBIDDEN", "Docs are not available to guests");
  }
  return {
    wsId,
    userId: member.userId,
    role: member.role as Exclude<Role, "guest">,
  } as DocsCtx;
}

/**
 * Load a page in the caller's workspace, trashed rows included.
 *
 * ux-spec PE-05 deep-links to a trashed page and expects a restore card, so
 * the loader that backs GET must return the row rather than hide it. Callers
 * that need a live page use `requireLivePage`.
 */
export function requirePage(ctx: DocsCtx, id: string): PageRow {
  const row = currentDb().select().from(pages).where(eq(pages.id, id)).get();
  if (!row || row.workspaceId !== ctx.wsId) throw new HttpError("NOT_FOUND", "Page not found");
  return row;
}

/** As `requirePage`, but a trashed page reads as absent. */
export function requireLivePage(ctx: DocsCtx, id: string): PageRow {
  const row = requirePage(ctx, id);
  if (row.deletedAt !== null) throw new HttpError("NOT_FOUND", "Page not found");
  return row;
}

/**
 * Mention targets that resolve inside this workspace (§2.6: "mention nodes
 * validated against workspace members").
 *
 * Answers are memoised for the life of the resolver, so one request that
 * mentions the same person in forty blocks costs one query rather than forty.
 * A batch builds one resolver and hands it to every op.
 */
export function workspaceMentions(ctx: DocsCtx): MentionResolver {
  const cache = new Map<string, boolean>();
  return {
    exists(target: MentionTarget, id: string): boolean {
      const key = `${target}:${id}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const found = resolveMention(ctx.wsId, target, id);
      cache.set(key, found);
      return found;
    },
  };
}

function resolveMention(wsId: string, target: MentionTarget, id: string): boolean {
  const db = currentDb();
  if (target === "user") {
    return (
      db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, id)))
        .get() !== undefined
    );
  }
  if (target === "page") {
    return (
      db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.workspaceId, wsId), eq(pages.id, id), isNull(pages.deletedAt)))
        .get() !== undefined
    );
  }
  return (
    db
      .select({ id: issues.id })
      .from(issues)
      .where(and(eq(issues.workspaceId, wsId), eq(issues.id, id), isNull(issues.deletedAt)))
      .get() !== undefined
  );
}

/**
 * The subtree of `path`, as a half-open key range over the materialized path.
 *
 * `LIKE path || '/%'` is the obvious spelling and is wrong twice: SQLite's
 * LIKE is case-insensitive for ASCII by default, so it matches sibling paths
 * differing only in case, and a case-insensitive comparison cannot use the
 * BINARY-collated (workspace_id, path) index, so it degrades to a table scan.
 * Measured on this engine: LIKE gives `SCAN`, this range gives
 * `SEARCH USING COVERING INDEX`.
 *
 * '/' is 0x2F and '0' is 0x30, so [path + "/", path + "0") is exactly the set
 * of strict descendants. The node itself is excluded and callers add it back
 * by id when they mean the whole subtree.
 */
export function descendantRange(path: string): { lo: string; hi: string } {
  return { lo: `${path}/`, hi: `${path}0` };
}

/** Ids of every live page whose id appears in `ids` and is in this workspace. */
export function livePageIds(ctx: DocsCtx, ids: readonly string[]): Set<string> {
  if (ids.length === 0) return new Set();
  const rows = currentDb()
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.workspaceId, ctx.wsId), isNull(pages.deletedAt), inArray(pages.id, [...ids])))
    .all();
  return new Set(rows.map((r) => r.id));
}
