/**
 * PATCH/DELETE /api/states/:id — admin+, workspace-scoped via the
 * state's team. DELETE refused (409) for a team's last state so every
 * team always keeps a workflow.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { issues, states, teams } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const CATEGORIES = ["backlog", "unstarted", "started", "completed", "canceled", "triage"] as const;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  category: z.enum(CATEGORIES).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

function loadState(request: Request, stateId: string | undefined, minRole?: "admin") {
  const db = currentDb();
  const state = db.select().from(states).where(eq(states.id, stateId as string)).get();
  if (!state) throw new HttpError("NOT_FOUND", "State not found");
  const team = db.select().from(teams).where(eq(teams.id, state.teamId)).get();
  if (!team) throw new HttpError("NOT_FOUND", "State not found");
  requireWorkspace(request, team.workspaceId, minRole);
  return { state, team };
}

export const PATCH = route(async (ctx: Ctx) => {
  const { state } = loadState(ctx.request, ctx.params.id, "admin");
  const body = await parseBodyOptional(ctx.request, patchSchema);

  const db = currentDb();
  if (body.name !== undefined && body.name !== state.name) {
    const dup = db
      .select({ id: states.id, name: states.name })
      .from(states)
      .where(eq(states.teamId, state.teamId))
      .all()
      .find((s) => s.name === body.name);
    if (dup) throw new HttpError("CONFLICT", "State name already used in this team", [`name: ${body.name}`]);
  }

  const patch: Partial<typeof states.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.category !== undefined) patch.category = body.category;
  if (body.color !== undefined) patch.color = body.color;
  if (Object.keys(patch).length > 0) {
    db.update(states).set(patch).where(eq(states.id, state.id)).run();
  }
  return json({ state: db.select().from(states).where(eq(states.id, state.id)).get() });
});

export const DELETE = route(async (ctx: Ctx) => {
  const { state, team } = loadState(ctx.request, ctx.params.id, "admin");
  const db = currentDb();
  const siblings = db.select({ id: states.id }).from(states).where(eq(states.teamId, state.teamId)).all();
  if (siblings.length <= 1) {
    throw new HttpError("CONFLICT", "Cannot delete the team's last state");
  }
  const remaining = siblings.filter((s) => s.id !== state.id).map((s) => s.id);
  let fallbackId: string =
    team.defaultStateId !== null && remaining.includes(team.defaultStateId) ? team.defaultStateId : remaining[0];
  const teamPatch: Partial<typeof teams.$inferInsert> = {};
  if (team.defaultStateId === state.id) teamPatch.defaultStateId = fallbackId;
  if (team.triageStateId === state.id) {
    const triageSibling = db
      .select({ id: states.id })
      .from(states)
      .where(eq(states.teamId, state.teamId))
      .all()
      .find((s) => s.id !== state.id && s.id !== teamPatch.defaultStateId);
    fallbackId = (triageSibling ?? { id: fallbackId }).id;
    teamPatch.triageStateId = fallbackId;
  }
  if (Object.keys(teamPatch).length > 0) {
    db.update(teams).set(teamPatch).where(eq(teams.id, team.id)).run();
  }
  db.update(issues).set({ stateId: fallbackId }).where(eq(issues.stateId, state.id)).run();
  db.delete(states).where(eq(states.id, state.id)).run();
  return json({ ok: true });
});
