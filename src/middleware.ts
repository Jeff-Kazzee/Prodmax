/**
 * Astro middleware (M1b) — /api/* gate:
 * - Skips /api/health, /api/auth/signup, /api/auth/login and the
 *   anonymous-capable /api/invites/accept.
 * - 401 in the exact §3 error shape when no valid session cookie.
 * - Attaches locals.ctx = { user, session } for handlers.
 * - CSRF on mutating methods: Origin host must match the request host.
 *   Skipped when `x-prodmax-test: 1` is present and NODE_ENV !== production
 *   (direct-call tests have no Origin).
 * - Non-API routes pass through untouched.
 */
import { apiError } from "@/lib/api/errors";
import { readSession } from "@/lib/auth/session";
import type { MiddlewareHandler } from "astro";

const SKIP_EXACT = new Set<string>([
  "/api/health",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/invites/accept",
]);

const MUTATING = new Set<string>(["POST", "PUT", "PATCH", "DELETE"]);

export const onRequest: MiddlewareHandler = (context, next) => {
  const { request } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") || url.pathname === "/api") {
    return next();
  }

  if (SKIP_EXACT.has(url.pathname)) {
    return next();
  }

  const found = readSession(request);
  if (!found) {
    return apiError("AUTH_REQUIRED", "Authentication required");
  }
  (context.locals as { ctx?: { user: typeof found.user; session: typeof found.session } }).ctx = {
    user: found.user,
    session: found.session,
  };

  if (MUTATING.has(request.method)) {
    const testBypass =
      request.headers.get("x-prodmax-test") === "1" && process.env.NODE_ENV !== "production";
    if (!testBypass && !originMatches(request, url)) {
      return apiError("FORBIDDEN", "Cross-origin request blocked (CSRF)");
    }
  }

  return next();
};

/** Origin header host must equal the request's own host. */
export function originMatches(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin non-browser/none → allow (cookie+no-Origin)
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}
