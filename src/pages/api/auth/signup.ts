/**
 * POST /api/auth/signup — {email, name, password ≥ 8} → user + session.
 * No workspace is created here (workspace creation is a separate step).
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { hashPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookie } from "@/lib/auth/session";
import { uuid7 } from "@/db/ids";
import type { APIRoute } from "astro";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});

export const POST: APIRoute = route(async (ctx) => {
  const request = (ctx as { request: Request }).request;
  const body = await parseBody(request, bodySchema);

  const db = currentDb();
  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get();
  if (existing) {
    throw new HttpError("CONFLICT", "An account with this email already exists");
  }

  const now = Date.now();
  const id = uuid7();
  db.insert(users)
    .values({
      id,
      email: body.email,
      passwordHash: hashPassword(body.password),
      name: body.name,
      avatarSeed: randomBytes(6).toString("hex"),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const { token } = createSession(id, {
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });

  return json(
    { user: { id, email: body.email, name: body.name }, cookieName: SESSION_COOKIE },
    201,
    { "set-cookie": sessionCookie(token) },
  );
});
