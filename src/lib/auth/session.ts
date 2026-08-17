/**
 * Session management (M1b): opaque 32-byte cookie token; sessions table
 * stores only SHA-256(token). Cookie `prodmax_session`, HttpOnly,
 * SameSite=Lax (+ Secure in production), 30-day sliding window.
 */
import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { currentDb } from "@/lib/api/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "prodmax_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarSeed: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Serialize a Set-Cookie value for the session cookie. */
export function sessionCookie(token: string, maxAgeSeconds = SESSION_TTL_MS / 1000): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Expired-session clearing cookie. */
export function clearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Read the raw cookie token from a request (no astro dependency). */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

/**
 * Create a session row; returns the raw token (only place it exists in
 * clear) plus the record. Caller sets the cookie header.
 */
export function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): { token: string; record: SessionRecord } {
  const now = Date.now();
  const token = randomBytes(32).toString("base64url");
  const id = hashToken(token);
  const ipHash = meta.ip ? createHash("sha256").update(meta.ip).digest("hex").slice(0, 32) : null;
  currentDb()
    .insert(sessions)
    .values({
      id,
      userId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastUsedAt: now,
      userAgent: meta.userAgent ?? null,
      ipHash,
    })
    .run();
  return { token, record: { id, userId, createdAt: now, expiresAt: now + SESSION_TTL_MS } };
}

/**
 * Resolve a request's session: cookie → sessions(sha256 token) → users.
 * Applies the sliding window (lastUsedAt + expiresAt bump) on success.
 * Returns null when absent, expired, or revoked.
 */
export function readSession(request: Request): { user: SessionUser; session: SessionRecord } | null {
  const token = readSessionCookie(request);
  if (!token) return null;
  const db = currentDb();
  const row = db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      email: users.email,
      name: users.name,
      avatarSeed: users.avatarSeed,
      userCreatedAt: users.createdAt,
      userUpdatedAt: users.updatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, hashToken(token)))
    .get();
  const now = Date.now();
  if (!row || row.revokedAt !== null || row.expiresAt <= now) return null;

  // Sliding window renewal.
  db.update(sessions)
    .set({ lastUsedAt: now, expiresAt: now + SESSION_TTL_MS })
    .where(eq(sessions.id, row.sessionId))
    .run();

  return {
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      avatarSeed: row.avatarSeed,
      createdAt: row.userCreatedAt,
      updatedAt: row.userUpdatedAt,
    },
    session: {
      id: row.sessionId,
      userId: row.userId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    },
  };
}

/** Revoke the request's session (idempotent) and clear the cookie. */
export function destroySession(request: Request): string {
  const token = readSessionCookie(request);
  if (token) {
    currentDb()
      .update(sessions)
      .set({ revokedAt: Date.now() })
      .where(eq(sessions.id, hashToken(token)))
      .run();
  }
  return clearSessionCookie();
}

/** Purge expired/revoked sessions (housekeeping helper). */
export function pruneSessions(): void {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  currentDb()
    .delete(sessions)
    .where(sql`(${sessions.revokedAt} IS NOT NULL AND ${sessions.revokedAt} < ${cutoff}) OR ${sessions.expiresAt} < ${Date.now()}`)
    .run();
}
