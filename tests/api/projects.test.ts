/** Projects API: CRUD, validation, workspace isolation, materialized progress cache. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { GET as listProjects, POST as createProject } from "@/pages/api/projects/index";
import { GET as getProject, PATCH as patchProject, DELETE as deleteProject } from "@/pages/api/projects/[id]";
import { POST as createIssue } from "@/pages/api/issues/index";
import { PATCH as patchIssue, DELETE as deleteIssue } from "@/pages/api/issues/[id]/index";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

/** SQL text of every statement better-sqlite3 prepares while `fn` runs. */
async function recordStatements(fn: () => Promise<unknown>): Promise<string[]> {
  const original = sqlite.prepare.bind(sqlite);
  const seen: string[] = [];
  sqlite.prepare = ((source: string) => {
    seen.push(source);
    return original(source);
  }) as typeof sqlite.prepare;
  try {
    await fn();
  } finally {
    sqlite.prepare = original;
  }
  return seen;
}

/** EXPLAIN QUERY PLAN detail lines for one recorded statement. */
function explain(db: Database.Database, source: string): string[] {
  if (!/^\s*(select|insert|update|delete)/i.test(source)) return [];
  const params = new Array((source.match(/\?/g) ?? []).length).fill(null);
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${source}`).all(...params) as Array<{ detail: string }>;
  return rows.map((r) => r.detail);
}

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function env(email = "proj@x.com", slug = "proj-ws") {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "P", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Proj Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  const userId = (await bodyOf(res)).user.id as string;
  return { wsId: data.workspace.id as string, teamId: data.defaultTeamId as string, cookie, userId };
}

function stateIdOf(teamId: string, category: string): string {
  return (sqlite.prepare("SELECT id FROM states WHERE team_id = ? AND category = ?").get(teamId, category) as { id: string }).id;
}

async function makeProject(wsId: string, cookie: string, body: Record<string, unknown>) {
  const res = await createProject({ request: apiReq("POST", `/projects?wsId=${wsId}`, { cookie, body, test: true }) });
  return { res, body: await bodyOf(res) };
}

async function readProject(wsId: string, cookie: string, id: string) {
  const res = await getProject({ request: apiReq("GET", `/projects/${id}?wsId=${wsId}`, { cookie }), params: { id } });
  return { res, body: await bodyOf(res) };
}

async function makeIssue(wsId: string, cookie: string, teamId: string, extra: Record<string, unknown> = {}) {
  const res = await createIssue({
    request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Task", ...extra }, test: true }),
  });
  return (await bodyOf(res)).issue as { id: string };
}

async function setIssueState(wsId: string, cookie: string, issueId: string, stateId: string) {
  return patchIssue({
    request: apiReq("PATCH", `/issues/${issueId}?wsId=${wsId}`, { cookie, body: { stateId }, test: true }),
    params: { id: issueId },
  });
}

describe("projects CRUD", () => {
  it("creates with defaults and lists ordered by fractional position", async () => {
    const { wsId, cookie } = await env();
    const a = await makeProject(wsId, cookie, { name: "Alpha" });
    expect(a.res.status).toBe(201);
    expect(a.body.project.status).toBe("backlog");
    expect(a.body.project.updateCadence).toBe("off");
    expect(a.body.project.progressCache).toBe(0);
    expect(a.body.project.progressPoints).toEqual({ done: 0, total: 0, issuesDone: 0, issuesTotal: 0 });
    expect(a.body.project.lastUpdateAt).toBeNull();
    expect(typeof a.body.project.position).toBe("string");

    const b = await makeProject(wsId, cookie, { name: "Beta", status: "started", updateCadence: "weekly" });
    expect(b.body.project.position > a.body.project.position).toBe(true);

    const listed = await listProjects({ request: apiReq("GET", `/projects?wsId=${wsId}`, { cookie }) });
    const data = (await bodyOf(listed)).data as Array<{ name: string }>;
    expect(data.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
  });

  it("rejects invalid input with 400 VALIDATION", async () => {
    const { wsId, cookie } = await env();
    const noName = await makeProject(wsId, cookie, {});
    expect(noName.res.status).toBe(400);
    expect(noName.body.error.code).toBe("VALIDATION");

    const badStatus = await makeProject(wsId, cookie, { name: "X", status: "doing" });
    expect(badStatus.res.status).toBe(400);

    const badDate = await makeProject(wsId, cookie, { name: "X", targetStartDate: "19/08/2026" });
    expect(badDate.res.status).toBe(400);
    expect(badDate.body.error.details[0]).toContain("targetStartDate");

    const badCadence = await makeProject(wsId, cookie, { name: "X", updateCadence: "hourly" });
    expect(badCadence.res.status).toBe(400);
  });

  it("PATCHes mutable fields and archives/unarchives via {archived}", async () => {
    const { wsId, cookie } = await env();
    const created = await makeProject(wsId, cookie, { name: "Alpha" });
    const id = created.body.project.id as string;

    const patched = await patchProject({
      request: apiReq("PATCH", `/projects/${id}?wsId=${wsId}`, {
        cookie,
        body: { name: "Alpha 2", status: "started", color: "#5e6ad2", targetEndDate: "2026-12-31", updateCadence: "biweekly" },
        test: true,
      }),
      params: { id },
    });
    expect(patched.status).toBe(200);
    const p = (await bodyOf(patched)).project;
    expect(p.name).toBe("Alpha 2");
    expect(p.status).toBe("started");
    expect(p.color).toBe("#5e6ad2");
    expect(p.targetEndDate).toBe("2026-12-31");
    expect(p.updateCadence).toBe("biweekly");
    expect(p.updatedAt).toBeGreaterThanOrEqual(p.createdAt);

    const archived = await patchProject({
      request: apiReq("PATCH", `/projects/${id}?wsId=${wsId}`, { cookie, body: { archived: true }, test: true }),
      params: { id },
    });
    expect(typeof (await bodyOf(archived)).project.archivedAt).toBe("number");

    const unarchived = await patchProject({
      request: apiReq("PATCH", `/projects/${id}?wsId=${wsId}`, { cookie, body: { archived: false }, test: true }),
      params: { id },
    });
    expect((await bodyOf(unarchived)).project.archivedAt).toBeNull();
  });

  it("?archived= mirrors the issues list: included by default, filterable", async () => {
    const { wsId, cookie } = await env();
    const a = await makeProject(wsId, cookie, { name: "Alpha" });
    await makeProject(wsId, cookie, { name: "Beta" });
    await patchProject({
      request: apiReq("PATCH", `/projects/${a.body.project.id}?wsId=${wsId}`, { cookie, body: { archived: true }, test: true }),
      params: { id: a.body.project.id as string },
    });

    const all = await listProjects({ request: apiReq("GET", `/projects?wsId=${wsId}`, { cookie }) });
    expect((await bodyOf(all)).data).toHaveLength(2);

    const onlyArchived = await listProjects({ request: apiReq("GET", `/projects?wsId=${wsId}&archived=true`, { cookie }) });
    const archivedData = (await bodyOf(onlyArchived)).data as Array<{ name: string }>;
    expect(archivedData.map((p) => p.name)).toEqual(["Alpha"]);

    const liveOnly = await listProjects({ request: apiReq("GET", `/projects?wsId=${wsId}&archived=false`, { cookie }) });
    const liveData = (await bodyOf(liveOnly)).data as Array<{ name: string }>;
    expect(liveData.map((p) => p.name)).toEqual(["Beta"]);
  });

  it("soft-deletes; GET 404s and list omits trash", async () => {
    const { wsId, cookie } = await env();
    const created = await makeProject(wsId, cookie, { name: "Gone" });
    const id = created.body.project.id as string;

    const del = await deleteProject({ request: apiReq("DELETE", `/projects/${id}?wsId=${wsId}`, { cookie, test: true }), params: { id } });
    expect(del.status).toBe(200);
    expect(typeof (await bodyOf(del)).project.deletedAt).toBe("number");

    const got = await readProject(wsId, cookie, id);
    expect(got.res.status).toBe(404);
    expect(got.body.error.code).toBe("NOT_FOUND");

    const listed = await listProjects({ request: apiReq("GET", `/projects?wsId=${wsId}`, { cookie }) });
    expect((await bodyOf(listed)).data).toHaveLength(0);

    const again = await deleteProject({ request: apiReq("DELETE", `/projects/${id}?wsId=${wsId}`, { cookie, test: true }), params: { id } });
    expect(again.status).toBe(404);
  });

  it("isolates workspaces: 404 across workspaces, 401 without a session", async () => {
    const a = await env("a@x.com", "ws-a");
    const b = await env("b@x.com", "ws-b");
    const created = await makeProject(a.wsId, a.cookie, { name: "Secret" });
    const id = created.body.project.id as string;

    // b is not a member of a's workspace → requireWorkspace hides it (§7).
    const asStranger = await readProject(a.wsId, b.cookie, id);
    expect(asStranger.res.status).toBe(404);

    // b IS a member of b's workspace, but the project id is foreign → 404, no leak.
    const crossGet = await readProject(b.wsId, b.cookie, id);
    expect(crossGet.res.status).toBe(404);
    const crossPatch = await patchProject({
      request: apiReq("PATCH", `/projects/${id}?wsId=${b.wsId}`, { cookie: b.cookie, body: { name: "Hax" }, test: true }),
      params: { id },
    });
    expect(crossPatch.status).toBe(404);
    const crossDelete = await deleteProject({
      request: apiReq("DELETE", `/projects/${id}?wsId=${b.wsId}`, { cookie: b.cookie, test: true }),
      params: { id },
    });
    expect(crossDelete.status).toBe(404);

    const bList = await listProjects({ request: apiReq("GET", `/projects?wsId=${b.wsId}`, { cookie: b.cookie }) });
    expect((await bodyOf(bList)).data).toHaveLength(0);

    const anon = await readProject(a.wsId, "", id);
    expect(anon.res.status).toBe(401);
    expect(anon.body.error.code).toBe("AUTH_REQUIRED");
  });
});


describe("materialized progress cache", () => {
  it("tracks issue create / complete / un-complete via the mutation hook", async () => {
    const { wsId, teamId, cookie } = await env();
    const proj = await makeProject(wsId, cookie, { name: "P" });
    const projectId = proj.body.project.id as string;
    const done = stateIdOf(teamId, "completed");
    const todo = stateIdOf(teamId, "unstarted");

    const issue = await makeIssue(wsId, cookie, teamId, { projectId, estimate: 5 });
    let p = (await readProject(wsId, cookie, projectId)).body.project;
    expect(p.progressCache).toBe(0);
    expect(p.progressPoints).toEqual({ done: 0, total: 5, issuesDone: 0, issuesTotal: 1 });

    const completed = await setIssueState(wsId, cookie, issue.id, done);
    expect(completed.status).toBe(200);
    p = (await readProject(wsId, cookie, projectId)).body.project;
    expect(p.progressCache).toBe(100);
    expect(p.progressPoints).toEqual({ done: 5, total: 5, issuesDone: 1, issuesTotal: 1 });

    await setIssueState(wsId, cookie, issue.id, todo);
    p = (await readProject(wsId, cookie, projectId)).body.project;
    expect(p.progressCache).toBe(0);
    expect(p.progressPoints).toEqual({ done: 0, total: 5, issuesDone: 0, issuesTotal: 1 });
  });

  it("excludes canceled and soft-deleted issues from totals", async () => {
    const { wsId, teamId, cookie } = await env();
    const proj = await makeProject(wsId, cookie, { name: "P" });
    const projectId = proj.body.project.id as string;
    const done = stateIdOf(teamId, "completed");
    const canceled = stateIdOf(teamId, "canceled");
    const todo = stateIdOf(teamId, "unstarted");

    const i1 = await makeIssue(wsId, cookie, teamId, { projectId, estimate: 5, title: "Keep" });
    const i2 = await makeIssue(wsId, cookie, teamId, { projectId, estimate: 5, title: "Drop" });
    await setIssueState(wsId, cookie, i1.id, done);
    await setIssueState(wsId, cookie, i2.id, canceled);

    // i2 (canceled) is out of both counters: 5 of 5 points done → 100.
    let p = (await readProject(wsId, cookie, projectId)).body.project;
    expect(p.progressCache).toBe(100);
    expect(p.progressPoints).toEqual({ done: 5, total: 5, issuesDone: 1, issuesTotal: 1 });

    // Back to an open state: 5 of 10 done, 1 of 2 issues done.
    await setIssueState(wsId, cookie, i2.id, todo);
    p = (await readProject(wsId, cookie, projectId)).body.project;
    expect(p.progressCache).toBe(50);
    expect(p.progressPoints).toEqual({ done: 5, total: 10, issuesDone: 1, issuesTotal: 2 });

    // Trashing the completed issue leaves only the open one.
    const del = await deleteIssue({
      request: apiReq("DELETE", `/issues/${i1.id}?wsId=${wsId}`, { cookie, test: true }),
      params: { id: i1.id },
    });
    expect(del.status).toBe(200);
    p = (await readProject(wsId, cookie, projectId)).body.project;
    expect(p.progressCache).toBe(0);
    expect(p.progressPoints).toEqual({ done: 0, total: 5, issuesDone: 0, issuesTotal: 1 });
  });

  it("refreshes both projects when an issue moves project or is unassigned", async () => {
    const { wsId, teamId, cookie } = await env();
    const a = await makeProject(wsId, cookie, { name: "A" });
    const b = await makeProject(wsId, cookie, { name: "B" });
    const aId = a.body.project.id as string;
    const bId = b.body.project.id as string;
    const issue = await makeIssue(wsId, cookie, teamId, { projectId: aId, estimate: 3 });

    const moved = await patchIssue({
      request: apiReq("PATCH", `/issues/${issue.id}?wsId=${wsId}`, { cookie, body: { projectId: bId }, test: true }),
      params: { id: issue.id },
    });
    expect(moved.status).toBe(200);
    expect((await readProject(wsId, cookie, aId)).body.project.progressPoints).toEqual({ done: 0, total: 0, issuesDone: 0, issuesTotal: 0 });
    expect((await readProject(wsId, cookie, bId)).body.project.progressPoints).toEqual({ done: 0, total: 3, issuesDone: 0, issuesTotal: 1 });

    const unassigned = await patchIssue({
      request: apiReq("PATCH", `/issues/${issue.id}?wsId=${wsId}`, { cookie, body: { projectId: null }, test: true }),
      params: { id: issue.id },
    });
    expect(unassigned.status).toBe(200);
    expect((await readProject(wsId, cookie, bId)).body.project.progressPoints).toEqual({ done: 0, total: 0, issuesDone: 0, issuesTotal: 0 });
  });

  it("a counted write prepares no statement that scans issues, at any project size", async () => {
    const { wsId, teamId, cookie } = await env();
    const proj = await makeProject(wsId, cookie, { name: "P" });
    const projectId = proj.body.project.id as string;
    const done = stateIdOf(teamId, "completed");

    const small = await makeIssue(wsId, cookie, teamId, { projectId, estimate: 1 });
    const smallRun = await recordStatements(() => setIssueState(wsId, cookie, small.id, done));

    for (let i = 0; i < 60; i += 1) {
      await makeIssue(wsId, cookie, teamId, { projectId, estimate: i % 4 });
    }
    const large = await makeIssue(wsId, cookie, teamId, { projectId, estimate: 1 });
    const largeRun = await recordStatements(() => setIssueState(wsId, cookie, large.id, done));

    let planned = 0;
    for (const source of largeRun) {
      for (const step of explain(sqlite, source)) {
        planned += 1;
        expect(step, `plan scans issues: ${source}`).not.toMatch(/SCAN (TABLE )?issues\b/);
      }
    }
    expect(planned).toBeGreaterThan(0);
    expect(largeRun.length).toBe(smallRun.length);
  });

  it("a write that cannot move the counters touches no project row", async () => {
    const { wsId, teamId, cookie } = await env();
    const proj = await makeProject(wsId, cookie, { name: "P" });
    const projectId = proj.body.project.id as string;
    const issue = await makeIssue(wsId, cookie, teamId, { projectId, estimate: 3 });
    const before = sqlite.prepare("SELECT progress_points_cache AS c FROM projects WHERE id = ?").get(projectId) as { c: string };

    const titleEdit = await recordStatements(() =>
      patchIssue({
        request: apiReq("PATCH", `/issues/${issue.id}?wsId=${wsId}`, { cookie, body: { title: "Renamed" }, test: true }),
        params: { id: issue.id },
      }),
    );
    expect(titleEdit.some((sql) => /update\s+"?projects"?/i.test(sql))).toBe(false);

    // Two states in the same category: the stateId moves, the contribution does not.
    const inProgress = stateIdOf(teamId, "started");
    const inReview = `${inProgress}-twin`;
    sqlite
      .prepare("INSERT INTO states (id, team_id, name, category, position, color) SELECT ?, team_id, 'In Review', category, position || 'z', color FROM states WHERE id = ?")
      .run(inReview, inProgress);
    await setIssueState(wsId, cookie, issue.id, inProgress);
    const sideways = await recordStatements(() => setIssueState(wsId, cookie, issue.id, inReview));
    expect(sideways.some((sql) => /update\s+"?projects"?/i.test(sql))).toBe(false);

    const after = sqlite.prepare("SELECT progress_points_cache AS c FROM projects WHERE id = ?").get(projectId) as { c: string };
    expect(after.c).toBe(before.c);
  });
});

describe("leadId and briefPageId resolve inside the workspace", () => {
  it("rejects a lead from another workspace and an id that exists nowhere", async () => {
    const a = await env("lead-a@x.com", "lead-ws-a");
    const b = await env("lead-b@x.com", "lead-ws-b");

    const foreign = await makeProject(a.wsId, a.cookie, { name: "Foreign lead", leadId: b.userId });
    expect(foreign.res.status).toBe(400);
    expect(foreign.body.error.code).toBe("VALIDATION");
    expect(foreign.body.error.details).toEqual([`leadId: ${b.userId}`]);

    const missing = await makeProject(a.wsId, a.cookie, { name: "Missing lead", leadId: "no-such-user" });
    expect(missing.res.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION");

    const own = await makeProject(a.wsId, a.cookie, { name: "Own lead", leadId: a.userId });
    expect(own.res.status).toBe(201);
    expect(own.body.project.leadId).toBe(a.userId);

    const patched = await patchProject({
      request: apiReq("PATCH", `/projects/${own.body.project.id}?wsId=${a.wsId}`, {
        cookie: a.cookie,
        body: { leadId: b.userId },
        test: true,
      }),
      params: { id: own.body.project.id },
    });
    expect(patched.status).toBe(400);
    expect((await bodyOf(patched)).error.code).toBe("VALIDATION");
    expect((await readProject(a.wsId, a.cookie, own.body.project.id)).body.project.leadId).toBe(a.userId);
  });

  it("rejects a brief page from another workspace and accepts one from this one", async () => {
    const a = await env("brief-a@x.com", "brief-ws-a");
    const b = await env("brief-b@x.com", "brief-ws-b");
    const insertPage = (id: string, wsId: string, creatorId: string) =>
      sqlite
        .prepare(
          `INSERT INTO pages (id, workspace_id, parent_id, path, title, creator_id, position, depth,
             version, created_at, updated_at) VALUES (?, ?, NULL, ?, 'Brief', ?, 'a0', 0, 1, ?, ?)`,
        )
        .run(id, wsId, `/${id}`, creatorId, Date.now(), Date.now());
    insertPage("page-a", a.wsId, a.userId);
    insertPage("page-b", b.wsId, b.userId);

    const foreign = await makeProject(a.wsId, a.cookie, { name: "Foreign brief", briefPageId: "page-b" });
    expect(foreign.res.status).toBe(400);
    expect(foreign.body.error.details).toEqual(["briefPageId: page-b"]);

    const own = await makeProject(a.wsId, a.cookie, { name: "Own brief", briefPageId: "page-a" });
    expect(own.res.status).toBe(201);
    expect(own.body.project.briefPageId).toBe("page-a");
  });
});
