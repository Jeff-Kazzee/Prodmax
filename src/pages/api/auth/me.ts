/**
 * GET /api/auth/me — current user + workspace memberships + pending
 * invites addressed to the user's email.
 */
import { and, eq, isNull } from "drizzle-orm";
import { invites, workspaceMembers, workspaces } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { route, json } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/guards";

export const GET = route(async (ctx: { request: Request }) => {
  const { request } = ctx;
  const { user } = requireSession(request);
  const db = currentDb();

  const memberships = db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaces.timezone,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id))
    .all();

  const now = Date.now();
  const pending = db
    .select({
      id: invites.id,
      workspaceId: invites.workspaceId,
      workspaceName: workspaces.name,
      role: invites.role,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
    .where(
      and(
        eq(invites.email, user.email),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
      ),
    )
    .all()
    .filter((invite) => invite.expiresAt > now);

  return json({ user, workspaces: memberships, pendingInvites: pending });
});
