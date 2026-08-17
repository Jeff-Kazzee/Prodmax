/** Middleware tests: 401 gate, skips, CSRF, locals.ctx. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onRequest } from "@/middleware";
import type { MiddlewareHandler } from "astro";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { apiReq, createApiDb, sessionTokenFrom, cookieFor, teardownApiDb } from "./helpers";
import { POST as signup } from "@/pages/api/auth/signup";

const handler = onRequest as MiddlewareHandler;

async function run(request: Request): Promise<{ res: Response; locals: Record<string, unknown> }> {
  const locals: Record<string, unknown> = {};
  // Astro's MiddlewareHandler may return void per its type; our onRequest
  // always resolves to a Response (it either short-circuits or awaits next()).
  const res = (await handler({ request, locals, url: new URL(request.url) } as never, async () => new Response("next-ok"))) as Response;
  return { res, locals };
}

beforeEach(() => {
  createApiDb();
  resetRateLimits();
});
afterEach(teardownApiDb);

async function makeToken(): Promise<string> {
  const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "mw@x.com", name: "Mid", password: "longenough1" } }) });
  return sessionTokenFrom(res);
}

describe("middleware /api/* gate", () => {
  it("passes /api/health through without a session", async () => {
    const { res } = await run(apiReq("GET", "/health"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("next-ok");
  });

  it("returns the exact 401 error shape without a valid session", async () => {
    const { res } = await run(apiReq("GET", "/users/me"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "AUTH_REQUIRED", message: "Authentication required", details: [] },
    });
  });

  it("attaches locals.ctx for a valid session", async () => {
    const token = await makeToken();
    const { res, locals } = await run(apiReq("GET", "/users/me", { cookie: cookieFor(token) }));
    expect(res.status).toBe(200);
    expect((locals.ctx as { user: { email: string } }).user.email).toBe("mw@x.com");
  });

  it("blocks mutating requests with a mismatched Origin (403)", async () => {
    const token = await makeToken();
    const { res } = await run(apiReq("PATCH", "/users/me", { cookie: cookieFor(token), origin: "http://evil.example", body: { name: "X" } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Cross-origin request blocked (CSRF)", details: [] },
    });
  });

  it("allows mutating requests whose Origin matches the host", async () => {
    const token = await makeToken();
    const { res } = await run(apiReq("PATCH", "/users/me", { cookie: cookieFor(token), origin: "http://localhost", body: { name: "X" } }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("next-ok");
  });

  it("skips the CSRF check for x-prodmax-test outside production", async () => {
    const token = await makeToken();
    const { res } = await run(apiReq("POST", "/auth/logout", { cookie: cookieFor(token), origin: "http://evil.example", test: true }));
    expect(res.status).toBe(200);
  });

  it("leaves non-API routes untouched", async () => {
    const res = (await handler(
      { request: new Request("http://localhost/some/page"), locals: {}, url: new URL("http://localhost/some/page") } as never,
      async () => new Response("page"),
    )) as Response;
    expect(await res.text()).toBe("page");
  });
});
