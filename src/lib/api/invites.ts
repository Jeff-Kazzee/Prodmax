/** Invite token helpers (shared by create + accept endpoints + tests). */
import { createHash, randomBytes } from "node:crypto";

export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Raw invite code → stored SHA-256. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** New opaque invite code (base64url, 24 bytes). */
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
