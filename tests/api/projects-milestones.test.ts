/** Milestones API: CRUD, position ordering, derived progress, isolation. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createIssue } from "@/pages/api/issues/index";
import { PATCH as patchIssue, DELETE as deleteIssue } from "@/pages/api/issues/[id]/index";
import { GET as listMilestones, POST as createMilestone } from "@/pages/api/projects/[id]/milestones";
import { PATCH as patchMilestone, DELETE as deleteMilestone } from "@/pages/api/milestones/[id]";
import { generateKeyBetween } from "@/db/positions";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

interface Env {
  wsId: string;
  teamId: string;
  cookie: string;
  projectId: string;
}

/** Signup + workspace (default PRO team with five workflow states) + project row. */
async function env(email = "ms@x.com", slug = "ms-ws"): Promise<Env> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "Ms", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Ms Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id, teamId: data.defaultTeamId, cookie, projectId: insertProject(data.workspace.id) };
}

/** Projects API is a sibling slice; tests insert the parent row directly. */
function insertProject(wsId: string, name = "Project Alpha"): string {
  const id = `prj-${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();
  sqlite
    .prepare("INSERT INTO projects (id, workspace_id, name, position, created_at, updated_at) VALUES (?, ?, ?, 'V', ?, ?)")
    .run(id, wsId, name, now, now);
  return id;
}

function stateId(teamId: string, category: string): string {
  const row = sqlite.prepare("SELECT id FROM states WHERE team_id = ? AND category = ?").get(teamId, category) as
    | { id: string }
    | undefined;
  if (!row) throw new Error(`no ${category} state for team ${teamId}`);
  return row.id;
}

async function makeIssue(e: Env, title: string, milestoneId: string, estimate?: number): Promise<string> {
  const res = await createIssue({
    request: apiReq("POST", `/issues?wsId=${e.wsId}`, {
      cookie: e.cookie,
      body: { teamId: e.teamId, title, milestoneId, estimate },
      test: true,
    }),
  });
  expect(res.status).toBe(201);
  return (await bodyOf(res)).issue.id as string;
}

async function setIssueState(e: Env, issueId: string, category: string): Promise<void> {
  const res = await patchIssue({
    request: apiReq("PATCH", `/issues/${issueId}?wsId=${e.wsId}`, {
      cookie: e.cookie,
      body: { stateId: stateId(e.teamId, category) },
      test: true,
    }),
    params: { id: issueId },
  });
  expect(res.status).toBe(200);
}

function createMs(e: Env, body: unknown, projectId = e.projectId, cookie: string | null = e.cookie) {
  return createMilestone({
    request: apiReq("POST", `/projects/${projectId}/milestones`, { cookie, body, test: true }),
    params: { id: projectId },
  });
}

function listMs(e: Env, projectId = e.projectId, cookie: string | null = e.cookie) {
  return listMilestones({ request: apiReq("GET", `/projects/${projectId}/milestones`, { cookie }), params: { id: projectId } });
}

function patchMs(e: Env, id: string, body: unknown, cookie: string | null = e.cookie) {
  return patchMilestone({
    request: apiReq("PATCH", `/milestones/${id}`, { cookie, body, test: true }),
    params: { id },
  });
}

function deleteMs(e: Env, id: string, cookie: string | null = e.cookie) {
  return deleteMilestone({ request: apiReq("DELETE", `/milestones/${id}`, { cookie, test: true }), params: { id } });
}

describe("milestones CRUD", () => {
  it("creates with empty derived progress and appends in position order", async () => {
    const e = await env();
    const a = await createMs(e, { name: "M1", targetDate: "2026-09-01" });
    expect(a.status).toBe(201);
    const msA = (await bodyOf(a)).milestone;
    expect(msA.name).toBe("M1");
    expect(msA.targetDate).toBe("2026-09-01");
    expect(msA.projectId).toBe(e.projectId);
    expect(msA.progress).toEqual({ total: 0, startedOrCompleted: 0, completed: 0, pointsTotal: 0, pointsDone: 0 });

    const b = await createMs(e, { name: "M2" });
    expect(b.status).toBe(201);
    const msB = (await bodyOf(b)).milestone;
    expect(msB.targetDate).toBeNull();
    expect(msB.position > msA.position).toBe(true);

    const listed = await listMs(e);
    const body = await bodyOf(listed);
    expect(body.nextCursor).toBeNull();
    expect(body.data.map((m: { name: string }) => m.name)).toEqual(["M1", "M2"]);
  });

  it("inserts between two milestones via explicit position; PATCH position reorders", async () => {
    const e = await env();
    const msA = (await bodyOf(await createMs(e, { name: "A" }))).milestone;
    const msB = (await bodyOf(await createMs(e, { name: "B" }))).milestone;

    const c = await createMs(e, { name: "C", position: generateKeyBetween(msA.position, msB.position) });
    expect(c.status).toBe(201);
    let names = (await bodyOf(await listMs(e))).data.map((m: { name: string }) => m.name);
    expect(names).toEqual(["A", "C", "B"]);

    const msC = (await bodyOf(c)).milestone;
    const moved = await patchMs(e, msC.id, { position: generateKeyBetween(msB.position, null) });
    expect(moved.status).toBe(200);
    names = (await bodyOf(await listMs(e))).data.map((m: { name: string }) => m.name);
    expect(names).toEqual(["A", "B", "C"]);
  });

  it("PATCH partially updates name and targetDate", async () => {
    const e = await env();
    const ms = (await bodyOf(await createMs(e, { name: "A", targetDate: "2026-09-01" }))).milestone;

    const renamed = await patchMs(e, ms.id, { name: "A2" });
    expect((await bodyOf(renamed)).milestone).toMatchObject({ name: "A2", targetDate: "2026-09-01" });

    const cleared = await patchMs(e, ms.id, { targetDate: null });
    expect((await bodyOf(cleared)).milestone).toMatchObject({ name: "A2", targetDate: null });
  });

  it("PATCH/DELETE an unknown milestone → 404 NOT_FOUND", async () => {
    const e = await env();
    const missing = "no-such-milestone";
    const patched = await patchMs(e, missing, { name: "X" });
    expect(patched.status).toBe(404);
    expect((await bodyOf(patched)).error.code).toBe("NOT_FOUND");
    expect((await deleteMs(e, missing)).status).toBe(404);
  });

  it("DELETE soft-deletes: list omits it, later PATCH 404s, member issues keep milestone_id", async () => {
    const e = await env();
    const ms = (await bodyOf(await createMs(e, { name: "Gone" }))).milestone;
    const issueId = await makeIssue(e, "Member", ms.id);

    const del = await deleteMs(e, ms.id);
    expect(del.status).toBe(200);
    expect((await bodyOf(del)).milestone.deletedAt).not.toBeNull();

    expect((await bodyOf(await listMs(e))).data).toHaveLength(0);
    expect((await patchMs(e, ms.id, { name: "X" })).status).toBe(404);
    expect((await deleteMs(e, ms.id)).status).toBe(404);

    const row = sqlite.prepare("SELECT milestone_id FROM issues WHERE id = ?").get(issueId) as { milestone_id: string };
    expect(row.milestone_id).toBe(ms.id);
  });
});

describe("derived progress", () => {
  it("counts follow member issue states; canceled and trashed issues excluded", async () => {
    const e = await env();
    const ms = (await bodyOf(await createMs(e, { name: "M" }))).milestone;
    const i1 = await makeIssue(e, "started", ms.id, 2);
    const i2 = await makeIssue(e, "done", ms.id, 3);
    const i3 = await makeIssue(e, "todo", ms.id, 5); // default state: Todo (unstarted)
    const i4 = await makeIssue(e, "canceled", ms.id, 7);
    await setIssueState(e, i1, "started");
    await setIssueState(e, i2, "completed");
    await setIssueState(e, i4, "canceled");

    let progress = (await bodyOf(await listMs(e))).data[0].progress;
    expect(progress).toEqual({ total: 3, startedOrCompleted: 2, completed: 1, pointsTotal: 10, pointsDone: 3 });

    await setIssueState(e, i3, "completed");
    progress = (await bodyOf(await listMs(e))).data[0].progress;
    expect(progress).toEqual({ total: 3, startedOrCompleted: 3, completed: 2, pointsTotal: 10, pointsDone: 8 });

    const trashed = await deleteIssue({
      request: apiReq("DELETE", `/issues/${i2}?wsId=${e.wsId}`, { cookie: e.cookie, test: true }),
      params: { id: i2 },
    });
    expect(trashed.status).toBe(200);
    progress = (await bodyOf(await listMs(e))).data[0].progress;
    expect(progress).toEqual({ total: 2, startedOrCompleted: 2, completed: 1, pointsTotal: 7, pointsDone: 5 });
  });

  it("batches derivation across milestones in one list response", async () => {
    const e = await env();
    const msA = (await bodyOf(await createMs(e, { name: "A" }))).milestone;
    const msB = (await bodyOf(await createMs(e, { name: "B" }))).milestone;
    const inA = await makeIssue(e, "in A", msA.id, 2);
    const inB = await makeIssue(e, "in B", msB.id, 4);
    await setIssueState(e, inA, "started");
    await setIssueState(e, inB, "completed");

    const data = (await bodyOf(await listMs(e))).data;
    expect(data).toHaveLength(2);
    expect(data[0].progress).toEqual({ total: 1, startedOrCompleted: 1, completed: 0, pointsTotal: 2, pointsDone: 0 });
    expect(data[1].progress).toEqual({ total: 1, startedOrCompleted: 1, completed: 1, pointsTotal: 4, pointsDone: 4 });
  });
});

describe("workspace isolation + auth", () => {
  it("a non-member gets 404 on list/create/patch/delete; no existence leak", async () => {
    const a = await env("a@x.com", "ms-ws-a");
    const b = await env("b@x.com", "ms-ws-b");
    const ms = (await bodyOf(await createMs(a, { name: "Secret" }))).milestone;

    expect((await listMs(b, a.projectId)).status).toBe(404);
    expect((await createMs(b, { name: "Nope" }, a.projectId)).status).toBe(404);
    expect((await patchMs(b, ms.id, { name: "Nope" })).status).toBe(404);
    expect((await deleteMs(b, ms.id)).status).toBe(404);
  });

  it("unauthenticated requests get 401 AUTH_REQUIRED", async () => {
    const e = await env();
    const res = await listMs(e, e.projectId, null);
    expect(res.status).toBe(401);
    expect((await bodyOf(res)).error.code).toBe("AUTH_REQUIRED");
    expect((await createMs(e, { name: "X" }, e.projectId, null)).status).toBe(401);
  });
});

describe("validation", () => {
  it("rejects bad bodies with 400 VALIDATION", async () => {
    const e = await env();
    const noName = await createMs(e, { targetDate: "2026-09-01" });
    expect(noName.status).toBe(400);
    expect((await bodyOf(noName)).error.code).toBe("VALIDATION");

    expect((await createMs(e, { name: "" })).status).toBe(400);
    expect((await createMs(e, { name: "X", targetDate: "09/01/2026" })).status).toBe(400);
    expect((await createMs(e, { name: "X", position: "not a key!!" })).status).toBe(400);

    const ms = (await bodyOf(await createMs(e, { name: "Ok" }))).milestone;
    expect((await patchMs(e, ms.id, { targetDate: "2026-9-1" })).status).toBe(400);
    expect((await patchMs(e, ms.id, { position: "with space" })).status).toBe(400);
  });

  it("missing or soft-deleted parent project → 404 on list and create", async () => {
    const e = await env();
    expect((await listMs(e, "no-such-project")).status).toBe(404);
    expect((await createMs(e, { name: "X" }, "no-such-project")).status).toBe(404);

    sqlite.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").run(Date.now(), e.projectId);
    expect((await listMs(e)).status).toBe(404);
    expect((await createMs(e, { name: "X" })).status).toBe(404);
  });

  it("PATCH/DELETE 404 when the parent project is soft-deleted", async () => {
    const e = await env();
    const ms = (await bodyOf(await createMs(e, { name: "Orphan" }))).milestone;
    sqlite.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").run(Date.now(), e.projectId);
    expect((await patchMs(e, ms.id, { name: "X" })).status).toBe(404);
    expect((await deleteMs(e, ms.id)).status).toBe(404);
  });
});
