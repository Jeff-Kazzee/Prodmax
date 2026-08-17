/**
 * GET /api/workspaces/:id/invites — list open invites (admin+).
 * POST — {email, role, teamId?} → invite with hashed 7-day token;
 * returns { link: "/join/<token>" }. Guest invites require teamId.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { invites, teams, users, workspaceMembers } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { hashInviteToken } from "@/lib/api/invites";
import { uuid7 } from "@/db/ids";
import type { APIRoute } from "astro";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "member", "guest"]),
  teamId: z.string().min(1).optional(),
});

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export const GET: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  requireWorkspace(ctx.request, ctx.params.id, "admin");
  const rows = currentDb()
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      teamId: invites.teamId,
      createdBy: invites.createdBy,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(
      and(
        eq(invites.workspaceId, ctx.params.id as string),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
      ),
    )
    .orderBy(desc(invites.createdAt))
    .all()
    .filter((invite) => invite.expiresAt > Date.now());
  return json({ data: rows, nextCursor: null });
});

export const POST: APIRoute = route(async (raw) => {
  const ctx = raw as Ctx;
  const { ctx: sessionCtx } = requireWorkspace(ctx.request, ctx.params.id, "admin");
  const body = await parseBody(ctx.request, createSchema);

  const db = currentDb();
  const wsId = ctx.params.id as string;

  if (body.teamId !== undefined) {
    const team = db.select().from(teams).where(eq(teams.id, body.teamId)).get();
    if (!team || team.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Team not found");
  } else if (body.role === "guest") {
    throw new HttpError("VALIDATION", "Guest invites require a teamId", ["teamId: required for guest role"]);
  }

  // Already a member? No point inviting.
  const existingUser = db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get();
  if (existingUser) {
    const membership = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, wsId),
          eq(workspaceMembers.userId, existingUser.id),
        ),
      )
      .get();
    if (membership) {
      throw new HttpError("CONFLICT", "User is already a member of this workspace");
    }
  }

  const token = randomBytes(24).toString("base64url");
  const now = Date.now();
  const inviteId = uuid7();
  db.insert(invites)
    .values({
      id: inviteId,
      workspaceId: wsId,
      email: body.email,
      role: body.role,
      teamId: body.teamId ?? null,
      tokenHash: hashInviteToken(token),
      createdBy: sessionCtx.user.id,
      createdAt: now,
      expiresAt: now + EXPIRY_MS,
    })
    .run();

  const created = db.select().from(invites).where(eq(invites.id, inviteId)).get();
  return json({ invite: created, link: `/join/${token}`, token }, 201);
});
