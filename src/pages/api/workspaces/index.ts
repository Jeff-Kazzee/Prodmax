/**
 * GET /api/workspaces — my memberships. POST /api/workspaces — create +
 * owner member + default PRO team + default states + starter labels.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaceMembers, workspaces } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { json, route } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/guards";
import { parseBody } from "@/lib/api/parse";
import { isValidSlug, provisionWorkspace, slugify } from "@/lib/api/provision";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,40}$/, "3-40 chars: lowercase letters, digits, dashes")
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const GET = route(async (ctx: { request: Request }) => {
  const { user } = requireSession(ctx.request);
  const rows = currentDb()
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
  return json({ data: rows, nextCursor: null });
});

export const POST = route(async (ctx: { request: Request }) => {
  const { user } = requireSession(ctx.request);
  const body = await parseBody(ctx.request, createSchema);
  const slug = body.slug ?? slugify(body.name);
  if (!isValidSlug(slug)) {
    return json(
      {
        error: {
          code: "VALIDATION",
          message: "Validation failed",
          details: ["slug: must be 3-40 chars of lowercase letters, digits, and dashes"],
        },
      },
      400,
    );
  }
  const { workspaceId, teamId } = provisionWorkspace(user.id, {
    name: body.name,
    slug,
    timezone: body.timezone ?? "UTC",
  });
  return json({ workspace: { id: workspaceId, name: body.name, slug, timezone: body.timezone ?? "UTC" }, defaultTeamId: teamId }, 201);
});
