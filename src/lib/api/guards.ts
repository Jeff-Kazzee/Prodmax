/**
 * Auth/workspace guards (M1b). Every workspace-scoped query must go
 * through `requireWorkspace` so the §7 row-level scoping predicate
 * (workspace membership resolved server-side) is always applied.
 */
import { and, eq } from "drizzle-orm";
import { workspaceMembers, workspaces } from "@/db/schema";
import { currentDb } from "./db";
import { HttpError } from "./errors";
import { readSession, type SessionRecord, type SessionUser } from "@/lib/auth/session";

export type Role = "owner" | "admin" | "member" | "guest";

const ROLE_RANK: Record<Role, number> = { guest: 0, member: 1, admin: 2, owner: 3 };

/** true when `member`'s role satisfies `minRole` (owner>admin>member>guest). */
export function assertRole(
  member: { role: string },
  minRole: Role,
): boolean {
  const rank = ROLE_RANK[member.role as Role];
  return rank !== undefined && rank >= ROLE_RANK[minRole];
}

export interface SessionCtx {
  user: SessionUser;
  session: SessionRecord;
}

/**
 * Cookie → sessions(sha256 token) → users. Throws 401 AUTH_REQUIRED in
 * the exact §3 shape (via route()) when there is no valid session.
 */
export function requireSession(request: Request): SessionCtx {
  const found = readSession(request);
  if (!found) {
    throw new HttpError("AUTH_REQUIRED", "Authentication required");
  }
  return found;
}

export interface WorkspaceMemberRow {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  createdAt: number;
}

/**
 * Resolve the caller's membership in workspace `wsId`. Non-members and
 * unknown workspaces both yield 404 (no existence leak, §7). When
 * `minRole` is given, insufficient roles yield 403 FORBIDDEN.
 */
export function requireWorkspace(
  request: Request,
  wsId: string | undefined | null,
  minRole?: Role,
): { ctx: SessionCtx; member: WorkspaceMemberRow; workspace: typeof workspaces.$inferSelect } {
  const ctx = requireSession(request);
  if (!wsId) throw new HttpError("NOT_FOUND", "Workspace not found");

  const db = currentDb();
  const ws = db.select().from(workspaces).where(eq(workspaces.id, wsId)).get();
  if (!ws) throw new HttpError("NOT_FOUND", "Workspace not found");

  const member = db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, ctx.user.id)))
    .get();
  if (!member) throw new HttpError("NOT_FOUND", "Workspace not found");

  const row: WorkspaceMemberRow = {
    id: member.id,
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role as Role,
    createdAt: member.createdAt,
  };
  if (minRole && !assertRole(row, minRole)) {
    throw new HttpError("FORBIDDEN", `Requires ${minRole} role or higher`);
  }
  return { ctx, member: row, workspace: ws };
}

/**
 * Fetch a workspace-scoped entity by id and verify the caller's access:
 * loads the row (by workspaceId column), returns 404 both for missing
 * rows and for rows outside a workspace the caller belongs to.
 */
export function scopedEntity<T extends { workspaceId: string }>(
  request: Request,
  wsId: string | undefined | null,
  loader: () => T | undefined,
): { ctx: SessionCtx; member: WorkspaceMemberRow; entity: T } {
  const { ctx, member } = requireWorkspace(request, wsId);
  const entity = loader();
  if (!entity || entity.workspaceId !== wsId) {
    throw new HttpError("NOT_FOUND", "Resource not found");
  }
  return { ctx, member, entity };
}
