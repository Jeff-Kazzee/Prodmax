/**
 * GET /api/teams/:id/states — workflow states (position order).
 * POST — admin+ {name, category, color?} (409 on duplicate name).
 * PATCH — batch reorder {order: [stateId, …]} (admin+).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { states, teams } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody, parseBodyOptional } from "@/lib/api/parse";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";
import type { APIRoute } from "astro";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const CATEGORIES = ["backlog", "unstarted", "started", "completed", "canceled", "triage"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(50),
  category: z.enum(CATEGORIES),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

const reorderSchema = z.object({ order: z.array(z.string().min(1)).min(1) });

/** Load team + enforce caller access; 404 for missing/cross-workspace. */
function loadTeam(request: Request, teamId: string | undefined, minRole?: "admin") {
  const team = currentDb().select().from(teams).where(eq(teams.id, teamId as string)).get();
  if (!team) throw new HttpError("NOT_FOUND", "Team not found");
  requireWorkspace(request, team.workspaceId, minRole);
  return team;
}

export const GET: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  loadTeam(ctx.request, ctx.params.id);
  const rows = currentDb()
    .select()
    .from(states)
    .where(eq(states.teamId, ctx.params.id as string))
    .all()
    .sort((a, b) => a.position.localeCompare(b.position));
  return json({ data: rows, nextCursor: null });
});

export const POST: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  const team = loadTeam(ctx.request, ctx.params.id, "admin");
  const body = await parseBody(ctx.request, createSchema);

  const db = currentDb();
  const dup = db
    .select({ id: states.id })
    .from(states)
    .where(and(eq(states.teamId, team.id), eq(states.name, body.name)))
    .get();
  if (dup) throw new HttpError("CONFLICT", "State name already used in this team", [`name: ${body.name}`]);

  const last = db
    .select()
    .from(states)
    .where(eq(states.teamId, team.id))
    .all()
    .map((s) => s.position)
    .sort()
    .at(-1) ?? null;

  const id = uuid7();
  db.insert(states)
    .values({
      id,
      teamId: team.id,
      name: body.name,
      category: body.category,
      color: body.color ?? null,
      position: generateKeyBetween(last, null),
    })
    .run();
  return json({ state: db.select().from(states).where(eq(states.id, id)).get() }, 201);
});

export const PATCH: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  const team = loadTeam(ctx.request, ctx.params.id, "admin");
  const body = await parseBodyOptional(ctx.request, reorderSchema);

  const db = currentDb();
  const existing = db.select().from(states).where(eq(states.teamId, team.id)).all();
  const known = new Map(existing.map((state) => [state.id, state]));
  const ordered = body.order.map((id) => known.get(id));
  if (ordered.some((state) => state === undefined)) {
    throw new HttpError("VALIDATION", "order contains states from another team", ["order: unknown state id"]);
  }
  if (ordered.length !== existing.length) {
    throw new HttpError("VALIDATION", "order must list every state of the team exactly once");
  }

  let prev: string | null = null;
  for (const state of ordered) {
    if (!state) continue;
    const position = generateKeyBetween(prev, null);
    db.update(states).set({ position }).where(eq(states.id, state.id)).run();
    prev = position;
  }
  return json({ ok: true });
});
