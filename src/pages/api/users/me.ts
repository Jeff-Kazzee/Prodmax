/**
 * GET /api/users/me — profile. PATCH /api/users/me — {name?, avatarSeed?}.
 * (preferences live in workspace settings in v1; nothing else mutable.)
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { json, route } from "@/lib/api/errors";
import { parseBodyOptional } from "@/lib/api/parse";
import { requireSession } from "@/lib/api/guards";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatarSeed: z.string().trim().min(1).max(64).optional(),
});

export const GET = route(async (ctx: { request: Request }) => {
  const { user } = requireSession(ctx.request);
  return json({ user });
});

export const PATCH = route(async (ctx: { request: Request }) => {
  const { request } = ctx;
  const { user } = requireSession(request);
  const body = await parseBodyOptional(request, patchSchema);
  if (body.name === undefined && body.avatarSeed === undefined) {
    return json({ user });
  }

  const db = currentDb();
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: Date.now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.avatarSeed !== undefined) patch.avatarSeed = body.avatarSeed;
  db.update(users).set(patch).where(eq(users.id, user.id)).run();

  const updated = db.select().from(users).where(eq(users.id, user.id)).get()!;
  return json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      avatarSeed: updated.avatarSeed,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});
