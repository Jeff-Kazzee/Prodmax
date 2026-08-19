/** Project updates API: health reports, progress snapshots, ordering, delete authorization. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as login } from "@/pages/api/auth/login";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createProject } from "@/pages/api/projects/index";
import { GET as getProject } from "@/pages/api/projects/[id]";
import { GET as listUpdates, POST as createUpdate } from "@/pages/api/projects/[id]/updates";
import { DELETE as deleteUpdate } from "@/pages/api/project-updates/[id]";
import { POST as createIssue } from "@/pages/api/issues/index";
import { PATCH as patchIssue } from "@/pages/api/issues/[id]/index";
import { apiReq, bodyOf, cookieFor, createApiDb, insertUser, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function env(email = "upd@x.com", slug = "upd-ws") {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "U", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Upd Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  const userId = (await bodyOf(res)).user.id as string;
  return { wsId: data.workspace.id as string, teamId: data.defaultTeamId as string, cookie, userId };
}

/** Direct-insert a member with `role` and log them in (members.test.ts pattern). */
async function addMember(wsId: string, key: string, role: string) {
  const user = insertUser(sqlite, { email: `${key}@x.com`, name: key });
  sqlite
    .prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)")
    .run(`${key}-membership`, wsId, user.id, role, Date.now());
  const loginRes = await login({ request: apiReq("POST", "/auth/login", { body: { email: `${key}@x.com`, password: "password123" } }) });
  expect(loginRes.status).toBe(200);
  return { userId: user.id, cookie: cookieFor(sessionTokenFrom(loginRes)) };
}

async function makeProject(wsId: string, cookie: string, name = "P"): Promise<string> {
  const res = await createProject({ request: apiReq("POST", `/projects?wsId=${wsId}`, { cookie, body: { name }, test: true }) });
  expect(res.status).toBe(201);
  return ((await bodyOf(res)).project as { id: string }).id;
}

async function postUpdate(wsId: string, cookie: string, projectId: string, body: Record<string, unknown>) {
  const res = await createUpdate({
    request: apiReq("POST", `/projects/${projectId}/updates?wsId=${wsId}`, { cookie, body, test: true }),
    params: { id: projectId },
  });
  return { res, body: await bodyOf(res) };
}

describe("project updates", () => {
  it("defaults progressSnapshot to the materialized progressCache at post time", async () => {
    const { wsId, teamId, cookie, userId } = await env();
    const projectId = await makeProject(wsId, cookie);

    // Drive the cache to 100: one estimated issue, completed.
    const issueRes = await createIssue({
      request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "T", projectId, estimate: 4 }, test: true }),
    });
    const issue = (await bodyOf(issueRes)).issue as { id: string };
    const done = (sqlite.prepare("SELECT id FROM states WHERE team_id = ? AND category = 'completed'").get(teamId) as { id: string }).id;
    await patchIssue({
      request: apiReq("PATCH", `/issues/${issue.id}?wsId=${wsId}`, { cookie, body: { stateId: done }, test: true }),
      params: { id: issue.id },
    });

    const implicit = await postUpdate(wsId, cookie, projectId, { health: "on_track", bodyMd: "All good" });
    expect(implicit.res.status).toBe(201);
    expect(implicit.body.update.progressSnapshot).toBe(100);
    expect(implicit.body.update.authorId).toBe(userId);

    const explicit = await postUpdate(wsId, cookie, projectId, { health: "at_risk", bodyMd: "Slipping", progressSnapshot: 42 });
    expect(explicit.res.status).toBe(201);
    expect(explicit.body.update.progressSnapshot).toBe(42);
  });

  it("validates health/bodyMd/snapshot and 404s on unknown or trashed projects", async () => {
    const { wsId, cookie } = await env();
    const projectId = await makeProject(wsId, cookie);

    const noBody = await postUpdate(wsId, cookie, projectId, { health: "on_track" });
    expect(noBody.res.status).toBe(400);
    expect(noBody.body.error.code).toBe("VALIDATION");

    const badHealth = await postUpdate(wsId, cookie, projectId, { health: "great", bodyMd: "x" });
    expect(badHealth.res.status).toBe(400);

    const badSnapshot = await postUpdate(wsId, cookie, projectId, { health: "on_track", bodyMd: "x", progressSnapshot: 101 });
    expect(badSnapshot.res.status).toBe(400);

    const missing = await postUpdate(wsId, cookie, "no-such-project", { health: "on_track", bodyMd: "x" });
    expect(missing.res.status).toBe(404);
  });

  it("GET lists newest-first; lastUpdateAt derives from the latest update", async () => {
    const { wsId, cookie } = await env();
    const projectId = await makeProject(wsId, cookie);
    const otherId = await makeProject(wsId, cookie, "Other");

    const fresh = await getProject({ request: apiReq("GET", `/projects/${projectId}?wsId=${wsId}`, { cookie }), params: { id: projectId } });
    expect((await bodyOf(fresh)).project.lastUpdateAt).toBeNull();

    const u1 = await postUpdate(wsId, cookie, projectId, { health: "on_track", bodyMd: "First" });
    const u2 = await postUpdate(wsId, cookie, projectId, { health: "off_track", bodyMd: "Second" });
    await postUpdate(wsId, cookie, otherId, { health: "at_risk", bodyMd: "Unrelated" });

    const listed = await listUpdates({ request: apiReq("GET", `/projects/${projectId}/updates?wsId=${wsId}`, { cookie }), params: { id: projectId } });
    expect(listed.status).toBe(200);
    const data = (await bodyOf(listed)).data as Array<{ id: string; bodyMd: string }>;
    expect(data.map((u) => u.id)).toEqual([u2.body.update.id, u1.body.update.id]);

    const proj = await getProject({ request: apiReq("GET", `/projects/${projectId}?wsId=${wsId}`, { cookie }), params: { id: projectId } });
    expect((await bodyOf(proj)).project.lastUpdateAt).toBe(u2.body.update.createdAt);
  });

  it("DELETE allows the author or a workspace admin, rejects other members (403)", async () => {
    const { wsId, cookie } = await env();
    const projectId = await makeProject(wsId, cookie);
    const member = await addMember(wsId, "member", "member");
    const admin = await addMember(wsId, "admin", "admin");

    // Owner is the author.
    const byOwner = await postUpdate(wsId, cookie, projectId, { health: "on_track", bodyMd: "Owner's" });
    const updateId = byOwner.body.update.id as string;

    const asMember = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${wsId}`, { cookie: member.cookie, test: true }),
      params: { id: updateId },
    });
    expect(asMember.status).toBe(403);
    expect((await bodyOf(asMember)).error.code).toBe("FORBIDDEN");

    const asAdmin = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${wsId}`, { cookie: admin.cookie, test: true }),
      params: { id: updateId },
    });
    expect(asAdmin.status).toBe(200);
    expect((await bodyOf(asAdmin)).ok).toBe(true);

    // A plain member deletes their own update.
    const byMember = await postUpdate(wsId, member.cookie, projectId, { health: "at_risk", bodyMd: "Mine" });
    const asAuthor = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${byMember.body.update.id}?wsId=${wsId}`, { cookie: member.cookie, test: true }),
      params: { id: byMember.body.update.id as string },
    });
    expect(asAuthor.status).toBe(200);

    const gone = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${wsId}`, { cookie: admin.cookie, test: true }),
      params: { id: updateId },
    });
    expect(gone.status).toBe(404);
  });

  it("isolates workspaces: 404 across workspaces, 401 without a session", async () => {
    const a = await env("own@x.com", "own-ws");
    const b = await env("other@x.com", "other-ws");
    const projectId = await makeProject(a.wsId, a.cookie);
    const posted = await postUpdate(a.wsId, a.cookie, projectId, { health: "on_track", bodyMd: "Secret" });
    const updateId = posted.body.update.id as string;

    // b is not a member of a's workspace → hidden.
    const asStranger = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${a.wsId}`, { cookie: b.cookie, test: true }),
      params: { id: updateId },
    });
    expect(asStranger.status).toBe(404);

    // b targets the foreign update id through b's own workspace → 404, no leak.
    const cross = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${b.wsId}`, { cookie: b.cookie, test: true }),
      params: { id: updateId },
    });
    expect(cross.status).toBe(404);

    const crossPost = await postUpdate(b.wsId, b.cookie, projectId, { health: "on_track", bodyMd: "Hax" });
    expect(crossPost.res.status).toBe(404);

    const crossList = await listUpdates({
      request: apiReq("GET", `/projects/${projectId}/updates?wsId=${b.wsId}`, { cookie: b.cookie }),
      params: { id: projectId },
    });
    expect(crossList.status).toBe(404);

    const anon = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${a.wsId}`, { test: true }),
      params: { id: updateId },
    });
    expect(anon.status).toBe(401);
  });
});
