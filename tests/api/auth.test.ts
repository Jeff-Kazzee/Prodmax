/** Auth endpoint tests: signup/login/logout/me + rate limiting. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as login } from "@/pages/api/auth/login";
import { POST as logout } from "@/pages/api/auth/logout";
import { GET as me } from "@/pages/api/auth/me";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { apiReq, bodyOf, createApiDb, sessionTokenFrom, cookieFor, teardownApiDb } from "./helpers";

beforeEach(() => {
  createApiDb();
  resetRateLimits();
});
afterEach(teardownApiDb);

describe("POST /api/auth/signup", () => {
  it("creates a user + session, sets cookie, creates no workspace", async () => {
    const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "a@x.com", name: "Ada", password: "longenough1" } }) });
    expect(res.status).toBe(201);
    const token = sessionTokenFrom(res);
    expect(token.length).toBeGreaterThan(20);
    const data = await bodyOf(res);
    expect(data.user.email).toBe("a@x.com");

    const meRes = await me({ request: apiReq("GET", "/auth/me", { cookie: cookieFor(token) }) });
    expect(meRes.status).toBe(200);
    const meData = await bodyOf(meRes);
    expect(meData.user.name).toBe("Ada");
    expect(meData.workspaces).toEqual([]);
    expect(meData.pendingInvites).toEqual([]);
  });

  it("rejects a short password with 400 + exact error shape", async () => {
    const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "b@x.com", name: "Bo", password: "short" } }) });
    expect(res.status).toBe(400);
    expect(await bodyOf(res)).toEqual({
      error: { code: "VALIDATION", message: "Validation failed", details: [expect.stringContaining("password")] },
    });
  });

  it("rejects duplicate email with 409 CONFLICT", async () => {
    const first = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "dup@x.com", name: "One", password: "longenough1" } }) });
    expect(first.status).toBe(201);
    const dup = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "dup@x.com", name: "Two", password: "longenough1" } }) });
    expect(dup.status).toBe(409);
    expect((await bodyOf(dup)).error.code).toBe("CONFLICT");
  });
});

describe("POST /api/auth/login", () => {
  async function seedUser() {
    const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "l@x.com", name: "Elle", password: "longenough1" } }) });
    expect(res.status).toBe(201);
  }

  it("returns a session cookie for valid credentials", async () => {
    await seedUser();
    const res = await login({ request: apiReq("POST", "/auth/login", { body: { email: "l@x.com", password: "longenough1" } }) });
    expect(res.status).toBe(200);
    expect(sessionTokenFrom(res).length).toBeGreaterThan(20);
    const data = await bodyOf(res);
    expect(data.user.email).toBe("l@x.com");
  });

  it("returns the same generic error for unknown email and wrong password", async () => {
    await seedUser();
    const unknown = await login({ request: apiReq("POST", "/auth/login", { body: { email: "ghost@x.com", password: "longenough1" } }) });
    const wrong = await login({ request: apiReq("POST", "/auth/login", { body: { email: "l@x.com", password: "wrongpassword" } }) });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    const unknownBody = await bodyOf(unknown);
    expect(unknownBody).toEqual({ error: { code: "AUTH_REQUIRED", message: "Invalid email or password", details: [] } });
    expect((await bodyOf(wrong)).error.message).toBe(unknownBody.error.message);
  });

  it("rate limits to 10 attempts / 5 min per email+IP (11th → 429)", async () => {
    await seedUser();
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await login({ request: apiReq("POST", "/auth/login", { body: { email: "l@x.com", password: "wrongpassword" } }) });
    }
    expect(last!.status).toBe(429);
    const body = await bodyOf(last!);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.details[0]).toContain("retry-after");
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session; subsequent /auth/me is 401", async () => {
    const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "o@x.com", name: "Oz", password: "longenough1" } }) });
    const token = sessionTokenFrom(res);
    const out = await logout({ request: apiReq("POST", "/auth/logout", { cookie: cookieFor(token), test: true }) });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()[0]).toContain("Max-Age=0");
    const after = await me({ request: apiReq("GET", "/auth/me", { cookie: cookieFor(token) }) });
    expect(after.status).toBe(401);
    expect((await bodyOf(after)).error.code).toBe("AUTH_REQUIRED");
  });
});
