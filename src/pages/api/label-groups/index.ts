/**
 * GET /api/label-groups?wsId= — label groups. POST — admin+ {name}
 * (409 on duplicate name in the workspace).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { labelGroups } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";

const createSchema = z.object({ name: z.string().trim().min(1).max(50) });

export const GET = route(async (ctx: { request: Request }) => {
  const wsId = new URL(ctx.request.url).searchParams.get("wsId");
  if (!wsId) throw new HttpError("VALIDATION", "wsId query parameter is required", ["wsId: required"]);
  requireWorkspace(ctx.request, wsId);
  const rows = currentDb()
    .select()
    .from(labelGroups)
    .where(eq(labelGroups.workspaceId, wsId))
    .all()
    .sort((a, b) => a.position.localeCompare(b.position));
  return json({ data: rows, nextCursor: null });
});

export const POST = route(async (ctx: { request: Request }) => {
  const wsId = new URL(ctx.request.url).searchParams.get("wsId");
  if (!wsId) throw new HttpError("VALIDATION", "wsId query parameter is required", ["wsId: required"]);
  requireWorkspace(ctx.request, wsId, "admin");
  const body = await parseBody(ctx.request, createSchema);

  const db = currentDb();
  const dup = db
    .select({ id: labelGroups.id })
    .from(labelGroups)
    .where(and(eq(labelGroups.workspaceId, wsId), eq(labelGroups.name, body.name)))
    .get();
  if (dup) throw new HttpError("CONFLICT", "Label group name already used", [`name: ${body.name}`]);

  const last = db
    .select()
    .from(labelGroups)
    .where(eq(labelGroups.workspaceId, wsId))
    .all()
    .map((g) => g.position)
    .sort()
    .at(-1) ?? null;

  const id = uuid7();
  db.insert(labelGroups)
    .values({ id, workspaceId: wsId, name: body.name, position: generateKeyBetween(last, null) })
    .run();
  return json({ group: db.select().from(labelGroups).where(eq(labelGroups.id, id)).get() }, 201);
});
