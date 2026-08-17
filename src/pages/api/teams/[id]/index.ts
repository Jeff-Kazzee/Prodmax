/**
 * GET/PATCH/DELETE /api/teams/:id — PATCH admin+; DELETE admin+ but
 * 409 while issues exist. Cross-workspace/team access → 404 (§7).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { issues, teamMembers, teams } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  timezone: z.string().trim().max(64).nullable().optional(),
});

export const GET = route(async (ctx: Ctx) => {
  const team = currentDb().select().from(teams).where(eq(teams.id, ctx.params.id as string)).get();
  if (!team) throw new HttpError("NOT_FOUND", "Team not found");
  const { member } = requireWorkspace(ctx.request, team.workspaceId);
  if (member.role === "guest") {
    // Guests see only their teams (§7 scoping).
    const inTeam = currentDb()
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, member.userId)))
      .get();
    if (!inTeam) throw new HttpError("NOT_FOUND", "Team not found");
  }
  return json({ team });
});

export const PATCH = route(async (ctx: Ctx) => {
  const team = currentDb().select().from(teams).where(eq(teams.id, ctx.params.id as string)).get();
  if (!team) throw new HttpError("NOT_FOUND", "Team not found");
  requireWorkspace(ctx.request, team.workspaceId, "admin");
  const body = await parseBodyOptional(ctx.request, patchSchema);

  const patch: Partial<typeof teams.$inferInsert> = { updatedAt: Date.now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.timezone !== undefined) patch.timezone = body.timezone;

  currentDb().update(teams).set(patch).where(eq(teams.id, team.id)).run();
  return json({ team: currentDb().select().from(teams).where(eq(teams.id, team.id)).get() });
});

export const DELETE = route(async (ctx: Ctx) => {
  const db = currentDb();
  const team = db.select().from(teams).where(eq(teams.id, ctx.params.id as string)).get();
  if (!team) throw new HttpError("NOT_FOUND", "Team not found");
  requireWorkspace(ctx.request, team.workspaceId, "admin");

  const issueCount = db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.teamId, team.id)))
    .all().length;
  if (issueCount > 0) {
    throw new HttpError("CONFLICT", "Team still has issues; move or delete them first", [
      `issues: ${issueCount} remaining`,
    ]);
  }

  db.delete(teams).where(eq(teams.id, team.id)).run();
  return json({ ok: true });
});
