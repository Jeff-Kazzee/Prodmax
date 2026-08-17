/**
 * GET /api/workspaces/:id/members — roster. Admin+ sees full rows
 * (email, joinedAt); member/guest see the minimal roster (§3.2).
 */
import { eq } from "drizzle-orm";
import { users, workspaceMembers } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { paginate } from "@/lib/api/paginate";

type Ctx = { request: Request; params: Record<string, string | undefined> };

export const GET = route(async (ctx: Ctx) => {
  const { member } = requireWorkspace(ctx.request, ctx.params.id);
  const url = new URL(ctx.request.url);

  const rows = currentDb()
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
      name: users.name,
      email: users.email,
      avatarSeed: users.avatarSeed,
      lastSeenAt: users.lastSeenAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, ctx.params.id as string))
    .all()
    .sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));

  const full = member.role === "owner" || member.role === "admin";
  const data = rows.map((row) =>
    full
      ? row
      : {
          userId: row.userId,
          role: row.role,
          name: row.name,
          avatarSeed: row.avatarSeed,
        },
  );

  const page = paginate(data, url.searchParams.get("cursor"), Number(url.searchParams.get("limit") ?? 50));
  return json(page);
});
