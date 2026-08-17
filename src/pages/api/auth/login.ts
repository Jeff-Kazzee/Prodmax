/**
 * POST /api/auth/login — {email, password} → session cookie.
 * Rate-limited: 10 attempts / 5 min / (email + IP). Failure always
 * returns the same generic error (no user-enumeration signal).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSession, sessionCookie } from "@/lib/auth/session";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export const POST = route(async (ctx: { request: Request }) => {
  const { request } = ctx;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  let body: z.infer<typeof bodySchema>;
  try {
    body = await parseBody(request, bodySchema);
  } catch (err) {
    // Malformed body still burns the budget for this email+IP.
    enforceRateLimit(`login:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    throw err;
  }

  enforceRateLimit(`login:${body.email}|${ip}`, MAX_ATTEMPTS, WINDOW_MS);

  const db = currentDb();
  const user = db.select().from(users).where(eq(users.email, body.email)).get();
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    throw new HttpError("AUTH_REQUIRED", "Invalid email or password");
  }

  const { token } = createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ip,
  });
  db.update(users).set({ lastSeenAt: Date.now() }).where(eq(users.id, user.id)).run();

  return json(
    {
      user: { id: user.id, email: user.email, name: user.name, avatarSeed: user.avatarSeed },
      cookieName: SESSION_COOKIE,
    },
    200,
    { "set-cookie": sessionCookie(token) },
  );
});
