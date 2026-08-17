/** POST /api/auth/logout — revoke the current session, clear cookie. */
import { json, route } from "@/lib/api/errors";
import { destroySession } from "@/lib/auth/session";

export const POST = route(async (ctx: { request: Request }) => {
  const { request } = ctx;
  const clearCookie = destroySession(request);
  return json({ ok: true }, 200, { "set-cookie": clearCookie });
});
