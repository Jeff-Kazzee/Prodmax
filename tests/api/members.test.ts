/** Member role/roster endpoint tests. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as listMembers } from "@/pages/api/workspaces/[id]/members/index";
import { PATCH as patchMember, DELETE as deleteMember } from "@/pages/api/workspaces/[id]/members/[userId]/index";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { apiReq, bodyOf, cookieFor, createApiDb, insertUser, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

interface Env {
  wsId: string;
  ownerToken: string;
  adminToken: string;
  adminId: string;
  memberToken: string;
  memberId: string;
  guestToken: string;
  guestId: string;
}

async function makeEnv(): Promise<Env> {
  const ownerRes = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "o@x.com", name: "Owner", password: "longenough1" } }) });
  const ownerToken = sessionTokenFrom(ownerRes);
  const ownerId = (await bodyOf(ownerRes)).user.id;
  const wsRes = await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(ownerToken), body: { name: "Roles", slug: "roles-ws" }, test: true }) });
  const wsId = (await bodyOf(wsRes)).workspace.id;

  const now = Date.now();
  const people: Array<{ key: string; role: string }> = [
    { key: "admin", role: "admin" },
    { key: "member", role: "member" },
    { key: "guest", role: "guest" },
  ];
  const env: Record<string, string> = { wsId, ownerToken };
  for (const person of people) {
    const email = `${person.key}@x.com`;
    const user = insertUser(sqlite, { email, name: person.key });
    sqlite
      .prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)")
      .run(`${person.key}-row`, wsId, user.id, person.role, now);
    const { POST: login } = await import("@/pages/api/auth/login");
    const loginRes = await login({ request: apiReq("POST", "/auth/login", { body: { email, password: "password123" } }) });
    expect(loginRes.status).toBe(200);
    env[`${person.key}Token`] = sessionTokenFrom(loginRes);
    env[`${person.key}Id`] = user.id;
  }
  env.ownerId = ownerId;
  return env as unknown as Env;
}

describe("GET /api/workspaces/:id/members", () => {
  it("admin sees full roster; member sees minimal roster", async () => {
    const env = await makeEnv();
    const adminRes = await listMembers({ request: apiReq("GET", `/workspaces/${env.wsId}/members`, { cookie: cookieFor(env.adminToken) }), params: { id: env.wsId } });
    expect(adminRes.status).toBe(200);
    const adminData = await bodyOf(adminRes);
    expect(adminData.data).toHaveLength(4);
    expect(adminData.data[0]).toHaveProperty("email");

    const memberRes = await listMembers({ request: apiReq("GET", `/workspaces/${env.wsId}/members`, { cookie: cookieFor(env.memberToken) }), params: { id: env.wsId } });
    const memberData = await bodyOf(memberRes);
    expect(memberData.data).toHaveLength(4);
    expect(memberData.data[0]).not.toHaveProperty("email");
    expect(memberData.data[0]).toHaveProperty("role");
  });
});

describe("PATCH /api/workspaces/:id/members/:userId", () => {
  it("admin can promote a member; guest cannot change anything", async () => {
    const env = await makeEnv();
    const ok = await patchMember({
      request: apiReq("PATCH", `/workspaces/${env.wsId}/members/${env.memberId}`, { cookie: cookieFor(env.adminToken), body: { role: "admin" }, test: true }),
      params: { id: env.wsId, userId: env.memberId },
    });
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).member.role).toBe("admin");

    const denied = await patchMember({
      request: apiReq("PATCH", `/workspaces/${env.wsId}/members/${env.memberId}`, { cookie: cookieFor(env.guestToken), body: { role: "member" }, test: true }),
      params: { id: env.wsId, userId: env.memberId },
    });
    expect(denied.status).toBe(403);
  });

  it("admin cannot touch the owner role (403) and last owner is protected (409)", async () => {
    const env = await makeEnv();
    const byAdmin = await patchMember({
      request: apiReq("PATCH", `/workspaces/${env.wsId}/members/${env.ownerId}`, { cookie: cookieFor(env.adminToken), body: { role: "member" }, test: true }),
      params: { id: env.wsId, userId: env.ownerId },
    });
    expect(byAdmin.status).toBe(403);

    const lastOwner = await patchMember({
      request: apiReq("PATCH", `/workspaces/${env.wsId}/members/${env.ownerId}`, { cookie: cookieFor(env.ownerToken), body: { role: "admin" }, test: true }),
      params: { id: env.wsId, userId: env.ownerId },
    });
    expect(lastOwner.status).toBe(409);
    expect((await bodyOf(lastOwner)).error.code).toBe("CONFLICT");
  });
});

describe("DELETE /api/workspaces/:id/members/:userId", () => {
  it("admin removes a member; owners are removable only by themselves", async () => {
    const env = await makeEnv();
    const ok = await deleteMember({
      request: apiReq("DELETE", `/workspaces/${env.wsId}/members/${env.memberId}`, { cookie: cookieFor(env.adminToken), test: true }),
      params: { id: env.wsId, userId: env.memberId },
    });
    expect(ok.status).toBe(200);

    const ownerByAdmin = await deleteMember({
      request: apiReq("DELETE", `/workspaces/${env.wsId}/members/${env.ownerId}`, { cookie: cookieFor(env.adminToken), test: true }),
      params: { id: env.wsId, userId: env.ownerId },
    });
    expect(ownerByAdmin.status).toBe(403);
    expect((await bodyOf(ownerByAdmin)).error.code).toBe("FORBIDDEN");
  });

  it("the last owner cannot leave (409)", async () => {
    const env = await makeEnv();
    const res = await deleteMember({
      request: apiReq("DELETE", `/workspaces/${env.wsId}/members/${env.ownerId}`, { cookie: cookieFor(env.ownerToken), test: true }),
      params: { id: env.wsId, userId: env.ownerId },
    });
    expect(res.status).toBe(409);
  });
});
