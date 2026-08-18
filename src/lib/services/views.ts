import { and, eq } from "drizzle-orm";
import { viewFavorites, views } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";
import type { z } from "zod";
import type { createViewSchema, patchViewSchema } from "@/lib/validation/views";
import { assertFilterDepth } from "./issues-filters";

export type CreateViewInput = z.input<typeof createViewSchema>;
export type PatchViewInput = z.infer<typeof patchViewSchema>;

function encodeFilters(filters: CreateViewInput["filters"]): string {
  if (!filters) return JSON.stringify({ combinator: "and", children: [] });
  assertFilterDepth(filters);
  return JSON.stringify(filters);
}

function nextViewPosition(wsId: string): string {
  const last =
    currentDb()
      .select({ position: views.position })
      .from(views)
      .where(eq(views.workspaceId, wsId))
      .all()
      .map((r) => r.position)
      .filter((p): p is string => p !== null)
      .sort()
      .at(-1) ?? null;
  return generateKeyBetween(last, null);
}

function serialize(row: typeof views.$inferSelect, favorited: boolean) {
  return {
    ...row,
    filters: JSON.parse(row.filters) as unknown,
    display: JSON.parse(row.display) as unknown,
    favorited,
  };
}

function favoritesFor(userId: string, viewIds: string[]): Set<string> {
  if (viewIds.length === 0) return new Set();
  const rows = currentDb()
    .select()
    .from(viewFavorites)
    .where(eq(viewFavorites.userId, userId))
    .all();
  return new Set(rows.filter((r) => viewIds.includes(r.viewId)).map((r) => r.viewId));
}

export function listViews(wsId: string, userId: string) {
  const rows = currentDb().select().from(views).where(eq(views.workspaceId, wsId)).all();
  const fav = favoritesFor(userId, rows.map((r) => r.id));
  return rows.map((r) => serialize(r, fav.has(r.id)));
}

export function getView(wsId: string, userId: string, viewId: string) {
  const row = currentDb().select().from(views).where(eq(views.id, viewId)).get();
  if (!row || row.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "View not found");
  const fav = favoritesFor(userId, [row.id]);
  return serialize(row, fav.has(row.id));
}

export function createView(wsId: string, actor: { userId: string; role: Role }, input: CreateViewInput) {
  const scope = input.scope ?? "workspace";
  const layout = input.layout ?? "list";
  const orderBy = input.orderBy ?? "created";
  const orderDir = input.orderDir ?? "desc";
  if (actor.role === "guest" && scope === "workspace") {
    throw new HttpError("FORBIDDEN", "Guests cannot create workspace-scoped views");
  }
  const now = Date.now();
  const id = uuid7();
  currentDb()
    .insert(views)
    .values({
      id,
      workspaceId: wsId,
      ownerId: actor.userId,
      scope,
      teamId: input.teamId ?? null,
      projectId: input.projectId ?? null,
      name: input.name,
      layout,
      filters: encodeFilters(input.filters),
      groupBy: input.groupBy ?? null,
      subGroupBy: input.subGroupBy ?? null,
      orderBy,
      orderDir,
      display: JSON.stringify(input.display ?? {}),
      position: nextViewPosition(wsId),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getView(wsId, actor.userId, id);
}

export function updateView(
  wsId: string,
  actor: { userId: string; role: Role },
  viewId: string,
  input: PatchViewInput,
) {
  const row = currentDb().select().from(views).where(eq(views.id, viewId)).get();
  if (!row || row.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "View not found");
  if (row.ownerId !== actor.userId && actor.role !== "admin" && actor.role !== "owner") {
    throw new HttpError("FORBIDDEN", "Only the owner or an admin may edit this view");
  }
  const patch: Partial<typeof views.$inferInsert> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.scope !== undefined) patch.scope = input.scope;
  if (input.teamId !== undefined) patch.teamId = input.teamId;
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.layout !== undefined) patch.layout = input.layout;
  if (input.filters !== undefined) patch.filters = encodeFilters(input.filters);
  if (input.groupBy !== undefined) patch.groupBy = input.groupBy;
  if (input.subGroupBy !== undefined) patch.subGroupBy = input.subGroupBy;
  if (input.orderBy !== undefined) patch.orderBy = input.orderBy;
  if (input.orderDir !== undefined) patch.orderDir = input.orderDir;
  if (input.display !== undefined) patch.display = JSON.stringify(input.display);
  currentDb().update(views).set(patch).where(eq(views.id, viewId)).run();
  return getView(wsId, actor.userId, viewId);
}

export function deleteView(wsId: string, actor: { userId: string; role: Role }, viewId: string) {
  const row = currentDb().select().from(views).where(eq(views.id, viewId)).get();
  if (!row || row.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "View not found");
  if (row.ownerId !== actor.userId && actor.role !== "admin" && actor.role !== "owner") {
    throw new HttpError("FORBIDDEN", "Only the owner or an admin may delete this view");
  }
  currentDb().delete(views).where(eq(views.id, viewId)).run();
  return { ok: true };
}

export function toggleViewFavorite(wsId: string, userId: string, viewId: string) {
  const row = currentDb().select().from(views).where(eq(views.id, viewId)).get();
  if (!row || row.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "View not found");
  const existing = currentDb()
    .select()
    .from(viewFavorites)
    .where(and(eq(viewFavorites.viewId, viewId), eq(viewFavorites.userId, userId)))
    .get();
  if (existing) {
    currentDb()
      .delete(viewFavorites)
      .where(and(eq(viewFavorites.viewId, viewId), eq(viewFavorites.userId, userId)))
      .run();
    return { favorited: false };
  }
  currentDb().insert(viewFavorites).values({ viewId, userId }).run();
  return { favorited: true };
}
