/** Teams, states, labels endpoint tests. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as listTeams, POST as createTeam } from "@/pages/api/teams/index";
import { GET as getTeam, PATCH as patchTeam, DELETE as deleteTeam } from "@/pages/api/teams/[id]/index";
import { GET as listStates, POST as createState, PATCH as reorderStates } from "@/pages/api/teams/[id]/states/index";
import { PATCH as patchState, DELETE as deleteState } from "@/pages/api/states/[id]/index";
import { GET as listLabels, POST as createLabel } from "@/pages/api/labels/index";
import { PATCH as patchLabel, DELETE as deleteLabel } from "@/pages/api/labels/[id]/index";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { apiReq, bodyOf, cookieFor, createApiDb, insertUser, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function env(): Promise<{ wsId: string; teamId: string; ownerToken: string; guestToken: string; guestId: string }> {
  const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "t@x.com", name: "Team Owner", password: "longenough1" } }) });
  const ownerToken = sessionTokenFrom(res);
  const wsRes = await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(ownerToken), body: { name: "Team Ws", slug: "team-ws" }, test: true }) });
  const data = await bodyOf(wsRes);

  const guest = insertUser(sqlite, { email: "guest@x.com", name: "Guest" });
  sqlite
    .prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)")
    .run("guest-row", data.workspace.id, guest.id, "guest", Date.now());
  const { POST: login } = await import("@/pages/api/auth/login");
  const guestLogin = await login({ request: apiReq("POST", "/auth/login", { body: { email: "guest@x.com", password: "password123" } }) });
  return {
    wsId: data.workspace.id,
    teamId: data.defaultTeamId,
    ownerToken,
    guestToken: sessionTokenFrom(guestLogin),
    guestId: guest.id,
  };
}

describe("teams", () => {
  it("creates a team; duplicate key in the workspace → 409", async () => {
    const { wsId, ownerToken } = await env();
    const ok = await createTeam({ request: apiReq("POST", `/teams?wsId=${wsId}`, { cookie: cookieFor(ownerToken), body: { key: "ENG", name: "Engineering" }, test: true }) });
    expect(ok.status).toBe(201);
    expect((await bodyOf(ok)).team.key).toBe("ENG");

    const dup = await createTeam({ request: apiReq("POST", `/teams?wsId=${wsId}`, { cookie: cookieFor(ownerToken), body: { key: "PRO", name: "Other" }, test: true }) });
    expect(dup.status).toBe(409);
  });

  it("lists teams; guests see only their teams", async () => {
    const { wsId, teamId, ownerToken, guestToken, guestId } = await env();
    const allRes = await listTeams({ request: apiReq("GET", `/teams?wsId=${wsId}`, { cookie: cookieFor(ownerToken) }) });
    expect((await bodyOf(allRes)).data).toHaveLength(1);

    const guestRes = await listTeams({ request: apiReq("GET", `/teams?wsId=${wsId}`, { cookie: cookieFor(guestToken) }) });
    expect((await bodyOf(guestRes)).data).toHaveLength(0);

    // Guest joins the team → now visible to them.
    sqlite.prepare("INSERT INTO team_members (id, team_id, user_id, created_at) VALUES (?,?,?,?)").run("tm-1", teamId, guestId, Date.now());
    const guestRes2 = await listTeams({ request: apiReq("GET", `/teams?wsId=${wsId}`, { cookie: cookieFor(guestToken) }) });
    expect((await bodyOf(guestRes2)).data).toHaveLength(1);
  });

  it("PATCHes a team (admin+); members are 403", async () => {
    const { teamId, ownerToken } = await env();
    const ok = await patchTeam({ request: apiReq("PATCH", `/teams/${teamId}`, { cookie: cookieFor(ownerToken), body: { description: "Core team" }, test: true }), params: { id: teamId } });
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).team.description).toBe("Core team");
  });

  it("DELETE 409 while issues exist; succeeds once empty", async () => {
    const { wsId, teamId, ownerToken } = await env();
    const now = Date.now();
    const state = sqlite.prepare("SELECT id FROM states WHERE team_id = ?").get(teamId) as { id: string };
    const creator = sqlite.prepare("SELECT id FROM users LIMIT 1").get() as { id: string };
    sqlite.prepare(
      `INSERT INTO issues (id, workspace_id, team_id, title, description_md, state_id, priority,
        assignee_id, creator_id, position, number, identifier, version, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,NULL,?,?,1,'PRO-1',1,?,?)`,
    ).run("issue-1", wsId, teamId, "Bug", "", state.id, 0, creator.id, "a", now, now);

    const blocked = await deleteTeam({ request: apiReq("DELETE", `/teams/${teamId}`, { cookie: cookieFor(ownerToken), test: true }), params: { id: teamId } });
    expect(blocked.status).toBe(409);
    expect((await bodyOf(blocked)).error.code).toBe("CONFLICT");

    sqlite.prepare("DELETE FROM issues").run();
    const ok = await deleteTeam({ request: apiReq("DELETE", `/teams/${teamId}`, { cookie: cookieFor(ownerToken), test: true }), params: { id: teamId } });
    expect(ok.status).toBe(200);
  });

  it("hides cross-workspace teams behind 404", async () => {
    const { teamId } = await env();
    const strangerRes = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "stranger2@x.com", name: "Stranger", password: "longenough1" } }) });
    const strangerToken = sessionTokenFrom(strangerRes);
    const res = await getTeam({ request: apiReq("GET", `/teams/${teamId}`, { cookie: cookieFor(strangerToken) }), params: { id: teamId } });
    expect(res.status).toBe(404);
  });
});

describe("states", () => {
  it("lists/creates states; duplicate name → 409", async () => {
    const { teamId, ownerToken } = await env();
    const list = await listStates({ request: apiReq("GET", `/teams/${teamId}/states`, { cookie: cookieFor(ownerToken) }), params: { id: teamId } });
    expect((await bodyOf(list)).data).toHaveLength(5);

    const created = await createState({ request: apiReq("POST", `/teams/${teamId}/states`, { cookie: cookieFor(ownerToken), body: { name: "Review", category: "started", color: "#aabbcc" }, test: true }), params: { id: teamId } });
    expect(created.status).toBe(201);

    const dup = await createState({ request: apiReq("POST", `/teams/${teamId}/states`, { cookie: cookieFor(ownerToken), body: { name: "Review", category: "started" }, test: true }), params: { id: teamId } });
    expect(dup.status).toBe(409);
  });

  it("reorders states (batch PATCH) and refuses deleting the last state", async () => {
    const { teamId, ownerToken } = await env();
    const before = ((await bodyOf(await listStates({ request: apiReq("GET", `/teams/${teamId}/states`, { cookie: cookieFor(ownerToken) }), params: { id: teamId } }))).data) as { id: string; name: string }[];
    const reversed = [...before].reverse();
    const reorder = await reorderStates({ request: apiReq("PATCH", `/teams/${teamId}/states`, { cookie: cookieFor(ownerToken), body: { order: reversed.map((s) => s.id) }, test: true }), params: { id: teamId } });
    expect(reorder.status).toBe(200);
    const after = ((await bodyOf(await listStates({ request: apiReq("GET", `/teams/${teamId}/states`, { cookie: cookieFor(ownerToken) }), params: { id: teamId } }))).data) as { id: string }[];
    expect(after.map((s) => s.id)).toEqual(reversed.map((s) => s.id));

    // Delete down to one state, then the last delete must 409.
    for (const state of after.slice(0, -1)) {
      const del = await deleteState({ request: apiReq("DELETE", `/states/${state.id}`, { cookie: cookieFor(ownerToken), test: true }), params: { id: state.id } });
      expect(del.status).toBe(200);
    }
    const last = after[after.length - 1];
    const blocked = await deleteState({ request: apiReq("DELETE", `/states/${last.id}`, { cookie: cookieFor(ownerToken), test: true }), params: { id: last.id } });
    expect(blocked.status).toBe(409);
  });

  it("renames a state; duplicate rename → 409", async () => {
    const { teamId, ownerToken } = await env();
    const states = ((await bodyOf(await listStates({ request: apiReq("GET", `/teams/${teamId}/states`, { cookie: cookieFor(ownerToken) }), params: { id: teamId } }))).data) as { id: string; name: string }[];
    const target = states[0];
    const ok = await patchState({ request: apiReq("PATCH", `/states/${target.id}`, { cookie: cookieFor(ownerToken), body: { name: "Triaged" }, test: true }), params: { id: target.id } });
    expect(ok.status).toBe(200);

    const dup = await patchState({ request: apiReq("PATCH", `/states/${states[1].id}`, { cookie: cookieFor(ownerToken), body: { name: "Triaged" }, test: true }), params: { id: states[1].id } });
    expect(dup.status).toBe(409);
  });
});

describe("labels", () => {
  it("full CRUD + duplicate name → 409; archive keeps the row", async () => {
    const { wsId, ownerToken } = await env();
    const created = await createLabel({ request: apiReq("POST", `/labels?wsId=${wsId}`, { cookie: cookieFor(ownerToken), body: { name: "Urgent", color: "#ff0000" }, test: true }) });
    expect(created.status).toBe(201);
    const label = (await bodyOf(created)).label;

    const dup = await createLabel({ request: apiReq("POST", `/labels?wsId=${wsId}`, { cookie: cookieFor(ownerToken), body: { name: "Urgent" }, test: true }) });
    expect(dup.status).toBe(409);

    const patched = await patchLabel({ request: apiReq("PATCH", `/labels/${label.id}`, { cookie: cookieFor(ownerToken), body: { archived: true }, test: true }), params: { id: label.id } });
    expect(patched.status).toBe(200);
    expect((await bodyOf(patched)).label.archivedAt).not.toBeNull();

    const list = await listLabels({ request: apiReq("GET", `/labels?wsId=${wsId}`, { cookie: cookieFor(ownerToken) }) });
    expect((await bodyOf(list)).data).toHaveLength(5); // 4 starter + Urgent (archived, still listed)

    const del = await deleteLabel({ request: apiReq("DELETE", `/labels/${label.id}`, { cookie: cookieFor(ownerToken), test: true }), params: { id: label.id } });
    expect(del.status).toBe(200);
    const list2 = await listLabels({ request: apiReq("GET", `/labels?wsId=${wsId}`, { cookie: cookieFor(ownerToken) }) });
    expect((await bodyOf(list2)).data).toHaveLength(4);
  });

  it("guests can read labels but not create them (403)", async () => {
    const { wsId, guestToken, ownerToken } = await env();
    const read = await listLabels({ request: apiReq("GET", `/labels?wsId=${wsId}`, { cookie: cookieFor(guestToken) }) });
    expect(read.status).toBe(200);

    const denied = await createLabel({ request: apiReq("POST", `/labels?wsId=${wsId}`, { cookie: cookieFor(guestToken), body: { name: "Nope" }, test: true }) });
    expect(denied.status).toBe(403);

    const ownerList = await listLabels({ request: apiReq("GET", `/labels?wsId=${wsId}`, { cookie: cookieFor(ownerToken) }) });
    expect((await bodyOf(ownerList)).data).toHaveLength(4); // nothing was created
  });
});
