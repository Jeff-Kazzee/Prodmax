/** Workspace endpoint tests: provisioning, role gates, delete confirm. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as listWs, POST as createWs } from "@/pages/api/workspaces/index";
import { GET as getWs, PATCH as patchWs, DELETE as deleteWs } from "@/pages/api/workspaces/[id]/index";
import { POST as signup } from "@/pages/api/auth/signup";
import { apiReq, bodyOf, cookieFor, createApiDb, insertUser, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function newSession(email = "w@x.com"): Promise<string> {
  const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email, name: "Ws User", password: "longenough1" } }) });
  return sessionTokenFrom(res);
}

async function createWorkspaceFor(email: string, name = "Acme", slug?: string): Promise<string> {
  const token = await newSession(email);
  const res = await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(token), body: { name, ...(slug ? { slug } : {}) }, test: true }) });
  expect(res.status).toBe(201);
  return (await bodyOf(res)).workspace.id as string;
}

describe("POST /api/workspaces", () => {
  it("provisions owner membership, PRO team, 5 states, starter labels", async () => {
    const token = await newSession();
    const res = await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(token), body: { name: "Acme" }, test: true }) });
    expect(res.status).toBe(201);
    const data = await bodyOf(res);
    expect(data.workspace.slug).toBe("acme");
    expect(data.defaultTeamId).toBeTruthy();

    const owner = sqlite.prepare("SELECT role FROM workspace_members").all() as { role: string }[];
    expect(owner).toEqual([{ role: "owner" }]);

    const team = sqlite.prepare("SELECT key, name FROM teams").get() as { key: string; name: string };
    expect(team.key).toBe("PRO");
    const stateCount = (sqlite.prepare("SELECT COUNT(*) c FROM states").get() as { c: number }).c;
    expect(stateCount).toBe(5);
    const labelNames = (sqlite.prepare("SELECT name FROM labels ORDER BY name").all() as { name: string }[]).map((l) => l.name);
    expect(labelNames).toEqual(["Bug", "Documentation", "Feature", "Improvement"]);
  });

  it("rejects a taken slug with 409", async () => {
    await createWorkspaceFor("first@x.com", "Same", "taken-slug");
    const token = await newSession("second@x.com");
    const res = await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(token), body: { name: "Other", slug: "taken-slug" }, test: true }) });
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error.code).toBe("CONFLICT");
  });
});

describe("GET /api/workspaces", () => {
  it("lists my memberships with roles", async () => {
    const token = await newSession();
    await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(token), body: { name: "Mine" }, test: true }) });
    const res = await listWs({ request: apiReq("GET", "/workspaces", { cookie: cookieFor(token) }) });
    expect(res.status).toBe(200);
    const data = await bodyOf(res);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].role).toBe("owner");
    expect(data.nextCursor).toBeNull();
  });
});

describe("GET/PATCH/DELETE /api/workspaces/:id", () => {
  let wsId: string;
  let ownerToken: string;
  let memberToken: string;
  let adminToken: string;

  beforeEach(async () => {
    ownerToken = await newSession("owner@x.com");
    const res = await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(ownerToken), body: { name: "Gate", slug: "gate-ws" }, test: true }) });
    wsId = (await bodyOf(res)).workspace.id;
    const now = Date.now();
    const member = insertUser(sqlite, { email: "member@x.com", name: "Member" });
    const admin = insertUser(sqlite, { email: "admin@x.com", name: "Admin" });
    sqlite
      .prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)")
      .run("m-row", wsId, member.id, "member", now);
    sqlite
      .prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)")
      .run("a-row", wsId, admin.id, "admin", now);
    // Sessions for the seeded users (login flow, real sessions).
    const { POST: login } = await import("@/pages/api/auth/login");
    memberToken = sessionTokenFrom(await login({ request: apiReq("POST", "/auth/login", { body: { email: "member@x.com", password: "password123" } }) }));
    adminToken = sessionTokenFrom(await login({ request: apiReq("POST", "/auth/login", { body: { email: "admin@x.com", password: "password123" } }) }));
  });

  it("GET returns the workspace for a member", async () => {
    const res = await getWs({ request: apiReq("GET", `/workspaces/${wsId}`, { cookie: cookieFor(memberToken) }), params: { id: wsId } });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).workspace.slug).toBe("gate-ws");
  });

  it("PATCH by a plain member is 403; by admin is 200", async () => {
    const denied = await patchWs({ request: apiReq("PATCH", `/workspaces/${wsId}`, { cookie: cookieFor(memberToken), body: { name: "Nope" }, test: true }), params: { id: wsId } });
    expect(denied.status).toBe(403);
    expect((await bodyOf(denied)).error.code).toBe("FORBIDDEN");

    const ok = await patchWs({ request: apiReq("PATCH", `/workspaces/${wsId}`, { cookie: cookieFor(adminToken), body: { name: "Renamed", timezone: "Europe/Berlin" }, test: true }), params: { id: wsId } });
    expect(ok.status).toBe(200);
    const data = await bodyOf(ok);
    expect(data.workspace.name).toBe("Renamed");
    expect(data.workspace.timezone).toBe("Europe/Berlin");
  });

  it("DELETE requires owner + matching confirm slug", async () => {
    const byAdmin = await deleteWs({ request: apiReq("DELETE", `/workspaces/${wsId}`, { cookie: cookieFor(adminToken), body: { confirm: "gate-ws" }, test: true }), params: { id: wsId } });
    expect(byAdmin.status).toBe(403);

    const badConfirm = await deleteWs({ request: apiReq("DELETE", `/workspaces/${wsId}`, { cookie: cookieFor(ownerToken), body: { confirm: "wrong" }, test: true }), params: { id: wsId } });
    expect(badConfirm.status).toBe(400);
    expect((await bodyOf(badConfirm)).error.code).toBe("VALIDATION");

    const ok = await deleteWs({ request: apiReq("DELETE", `/workspaces/${wsId}`, { cookie: cookieFor(ownerToken), body: { confirm: "gate-ws" }, test: true }), params: { id: wsId } });
    expect(ok.status).toBe(200);
    expect((sqlite.prepare("SELECT COUNT(*) c FROM workspaces").get() as { c: number }).c).toBe(0);
  });

  it("hides other people's workspaces (404, no leak)", async () => {
    const strangerToken = await newSession("stranger@x.com");
    const res = await getWs({ request: apiReq("GET", `/workspaces/${wsId}`, { cookie: cookieFor(strangerToken) }), params: { id: wsId } });
    expect(res.status).toBe(404);
    expect((await bodyOf(res)).error.code).toBe("NOT_FOUND");
  });
});
