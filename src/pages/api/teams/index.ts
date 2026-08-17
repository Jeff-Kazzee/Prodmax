/**
 * GET /api/teams?wsId= — teams in a workspace the caller belongs to
 * (guests only see teams they are members of). POST — admin+; key must
 * be [A-Z][A-Z0-9]{1,5}, unique per workspace (409).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { teamMembers, teams } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";
import type { APIRoute } from "astro";

type Ctx = { request: Request; url?: URL; params: Record<string, string | undefined> };

const createSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, "2-6 chars: uppercase letter first, then A-Z0-9"),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  timezone: z.string().trim().max(64).optional(),
});

function requireWsId(request: Request): string {
  const wsId = new URL(request.url).searchParams.get("wsId");
  if (!wsId) throw new HttpError("VALIDATION", "wsId query parameter is required", ["wsId: required"]);
  return wsId;
}

export const GET: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  const wsId = requireWsId(ctx.request);
  const { member } = requireWorkspace(ctx.request, wsId);

  const db = currentDb();
  const rows = db.select().from(teams).where(eq(teams.workspaceId, wsId)).all();

  let visible = rows;
  if (member.role === "guest") {
    const mine = new Set(
      db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, member.userId))
        .all()
        .map((r) => r.teamId),
    );
    visible = rows.filter((team) => mine.has(team.id));
  }
  return json({ data: visible, nextCursor: null });
});

export const POST: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  const wsId = requireWsId(ctx.request);
  requireWorkspace(ctx.request, wsId, "admin");
  const body = await parseBody(ctx.request, createSchema);

  const db = currentDb();
  const clash = db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.workspaceId, wsId), eq(teams.key, body.key)))
    .get();
  if (clash) throw new HttpError("CONFLICT", "Team key already used in this workspace", [`key: ${body.key}`]);

  const now = Date.now();
  const id = uuid7();
  const last = db.select().from(teams).where(eq(teams.workspaceId, wsId)).all()
    .map((t) => t.position)
    .sort()
    .at(-1) ?? null;
  db.insert(teams)
    .values({
      id,
      workspaceId: wsId,
      key: body.key,
      name: body.name,
      description: body.description ?? null,
      timezone: body.timezone ?? null,
      position: generateKeyBetween(last, null),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = db.select().from(teams).where(eq(teams.id, id)).get();
  return json({ team: created }, 201);
});
