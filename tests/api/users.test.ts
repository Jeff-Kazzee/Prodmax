/** /api/users/me tests. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getMe, PATCH as patchMe } from "@/pages/api/users/me";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";
import { POST as signup } from "@/pages/api/auth/signup";

beforeEach(createApiDb);
afterEach(teardownApiDb);

async function token(): Promise<string> {
  const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "u@x.com", name: "Original", password: "longenough1" } }) });
  return sessionTokenFrom(res);
}

describe("GET /api/users/me", () => {
  it("returns the profile for a valid session", async () => {
    const res = await getMe({ request: apiReq("GET", "/users/me", { cookie: cookieFor(await token()) }) });
    expect(res.status).toBe(200);
    const data = await bodyOf(res);
    expect(data.user.name).toBe("Original");
    expect(data.user).not.toHaveProperty("passwordHash");
  });

  it("is 401 without a session", async () => {
    const res = await getMe({ request: apiReq("GET", "/users/me") });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/users/me", () => {
  it("updates name + avatarSeed", async () => {
    const res = await patchMe({
      request: apiReq("PATCH", "/users/me", { cookie: cookieFor(await token()), body: { name: "Renamed", avatarSeed: "seed-9" }, test: true }),
    });
    expect(res.status).toBe(200);
    const data = await bodyOf(res);
    expect(data.user.name).toBe("Renamed");
    expect(data.user.avatarSeed).toBe("seed-9");
  });

  it("rejects an empty name with 400", async () => {
    const res = await patchMe({
      request: apiReq("PATCH", "/users/me", { cookie: cookieFor(await token()), body: { name: "" }, test: true }),
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.code).toBe("VALIDATION");
  });
});
