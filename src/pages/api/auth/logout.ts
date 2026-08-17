/** POST /api/auth/logout — revoke the current session, clear cookie. */
import { json, route } from "@/lib/api/errors";
import { destroySession } from "@/lib/auth/session";
import type { APIRoute } from "astro";

export const POST: APIRoute = route(async (ctx) => {
  const request = (ctx as { request: Request }).request;
  const clearCookie = destroySession(request);
  return json({ ok: true }, 200, { "set-cookie": clearCookie });
});
