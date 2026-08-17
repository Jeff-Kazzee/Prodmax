/**
 * GET /api/labels?wsId[=&teamId=] — labels (guests may read).
 * POST — admin+ {name, color?, description?, teamId?, groupId?};
 * (workspace, team, name) uniqueness enforced here (schema note).
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { labels, teams } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { uuid7 } from "@/db/ids";
import type { APIRoute } from "astro";

const createSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  description: z.string().trim().max(200).optional(),
  teamId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
});

function requireWsId(request: Request): string {
  const wsId = new URL(request.url).searchParams.get("wsId");
  if (!wsId) throw new HttpError("VALIDATION", "wsId query parameter is required", ["wsId: required"]);
  return wsId;
}

export const GET: APIRoute = route(async (raw) => {
  const ctx = raw as { request: Request };
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId);
  const teamId = new URL(ctx.request.url).searchParams.get("teamId");

  const rows = currentDb()
    .select()
    .from(labels)
    .where(
      teamId === null
        ? eq(labels.workspaceId, wsId)
        : and(eq(labels.workspaceId, wsId), eq(labels.teamId, teamId)),
    )
    .all()
    .sort((a, b) => a.name.localeCompare(b.name));
  return json({ data: rows, nextCursor: null });
});

export const POST: APIRoute = route(async (raw) => {
  const ctx = raw as { request: Request };
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId, "admin");
  const body = await parseBody(ctx.request, createSchema);

  const db = currentDb();
  const teamId = body.teamId ?? null;
  if (teamId !== null) {
    const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
    if (!team || team.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Team not found");
  }

  const dup = db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.workspaceId, wsId),
        teamId === null ? isNull(labels.teamId) : eq(labels.teamId, teamId),
        eq(labels.name, body.name),
      ),
    )
    .get();
  if (dup) throw new HttpError("CONFLICT", "Label name already used in this scope", [`name: ${body.name}`]);

  const id = uuid7();
  db.insert(labels)
    .values({
      id,
      workspaceId: wsId,
      teamId,
      name: body.name,
      color: body.color ?? null,
      description: body.description ?? null,
      groupId: body.groupId ?? null,
      createdAt: Date.now(),
    })
    .run();
  return json({ label: db.select().from(labels).where(eq(labels.id, id)).get() }, 201);
});
