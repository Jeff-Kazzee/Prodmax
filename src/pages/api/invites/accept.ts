/**
 * POST /api/invites/accept — {token, email?, name?, password?}.
 * Logged in: joins the workspace (409 if already a member).
 * Anonymous: signup-with-token (email/name/password required) → user +
 * session + membership. Guest invites scope the new member to the
 * invite's team (team_members row).
 */
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { invites, teamMembers, users, workspaceMembers, workspaces } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { hashInviteToken } from "@/lib/api/invites";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSession, readSession, sessionCookie } from "@/lib/auth/session";
import { uuid7 } from "@/db/ids";

const bodySchema = z.object({
  token: z.string().min(10),
  email: z.string().trim().toLowerCase().email().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const POST = route(async (ctx: { request: Request }) => {
  const { request } = ctx;
  const body = await parseBody(request, bodySchema);
  const db = currentDb();

  const invite = db.select().from(invites).where(eq(invites.tokenHash, hashInviteToken(body.token))).get();
  const now = Date.now();
  if (!invite || invite.revokedAt !== null || invite.acceptedAt !== null || invite.expiresAt <= now) {
    throw new HttpError("NOT_FOUND", "Invite not found or no longer valid");
  }
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, invite.workspaceId)).get();
  if (!workspace) throw new HttpError("NOT_FOUND", "Invite not found or no longer valid");

  // Resolve the joining user: existing session, matching-email account, or signup.
  const session = readSession(request);
  let userId: string;
  let setCookie: string | null = null;

  if (session) {
    userId = session.user.id;
  } else {
    const existing = body.email !== undefined
      ? db.select().from(users).where(eq(users.email, body.email)).get()
      : db.select().from(users).where(eq(users.email, invite.email)).get();
    if (existing) {
      // Known account: require the password to prove ownership.
      if (body.password === undefined || !verifyPassword(body.password, existing.passwordHash)) {
        throw new HttpError("AUTH_REQUIRED", "This email has an account; sign in first or provide your password");
      }
      userId = existing.id;
    } else {
      const email = body.email ?? invite.email;
      const name = body.name ?? email.split("@")[0];
      const password = body.password;
      if (password === undefined) {
        throw new HttpError("VALIDATION", "password is required to create an account", [
          "password: required (min 8 chars)",
        ]);
      }
      const id = uuid7();
      db.insert(users)
        .values({
          id,
          email,
          passwordHash: hashPassword(password),
          name,
          avatarSeed: randomBytes(6).toString("hex"),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      userId = id;
    }
    const created = createSession(userId, {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for"),
    });
    setCookie = sessionCookie(created.token);
  }

  const alreadyMember = db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
  if (alreadyMember) throw new HttpError("CONFLICT", "Already a member of this workspace");

  db.transaction((tx) => {
    tx.insert(workspaceMembers)
      .values({ id: uuid7(), workspaceId: invite.workspaceId, userId, role: invite.role, createdAt: now })
      .run();
    if (invite.role === "guest" && invite.teamId !== null) {
      tx.insert(teamMembers).values({ id: uuid7(), teamId: invite.teamId, userId, createdAt: now }).run();
    }
    tx.update(invites).set({ acceptedAt: now }).where(eq(invites.id, invite.id)).run();
  });

  const headers = setCookie ? { "set-cookie": setCookie } : undefined;
  return json(
    { ok: true, workspaceId: invite.workspaceId, workspaceSlug: workspace.slug, cookieName: SESSION_COOKIE },
    200,
    headers,
  );
});
