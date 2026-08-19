/**
 * Guest-role matrix for the M4 surface (architecture §7). Lines 840 to 842
 * deny guests on manage projects/milestones, posting project updates, and
 * managing cycles. Line 820 keeps their team-scoped read, so every group
 * asserts both halves and a member plus an admin run the same writes to
 * catch a `minRole` landing on the wrong handler.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as login } from "@/pages/api/auth/login";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createTeam } from "@/pages/api/teams/index";
import { GET as listProjects, POST as createProject } from "@/pages/api/projects/index";
import { GET as getProject, PATCH as patchProject, DELETE as deleteProject } from "@/pages/api/projects/[id]";
import { GET as listMilestones, POST as createMilestone } from "@/pages/api/projects/[id]/milestones";
import { PATCH as patchMilestone, DELETE as deleteMilestone } from "@/pages/api/milestones/[id]";
import { GET as listUpdates, POST as createUpdate } from "@/pages/api/projects/[id]/updates";
import { DELETE as deleteUpdate } from "@/pages/api/project-updates/[id]";
import { GET as listCycles, POST as createCycle } from "@/pages/api/cycles/index";
import { PATCH as patchCycle } from "@/pages/api/cycles/[id]";
import { POST as scopeCycle } from "@/pages/api/cycles/[id]/scope";
import { POST as closeCycle } from "@/pages/api/cycles/[id]/close";
import { POST as createIssue } from "@/pages/api/issues/index";
import { apiReq, bodyOf, cookieFor, createApiDb, insertUser, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

const HOUR = 3_600_000;
const activeWindow = () => ({ startsAt: Date.now() - HOUR, endsAt: Date.now() + HOUR });

interface Env {
  wsId: string;
  teamId: string;
  otherTeamId: string;
  owner: string;
  admin: string;
  member: string;
  guest: string;
  guestId: string;
}

/** Direct-insert a workspace member with `role` and log them in. */
async function addActor(wsId: string, key: string, role: string): Promise<{ userId: string; cookie: string }> {
  const user = insertUser(sqlite, { email: `${key}@x.com`, name: key });
  sqlite
    .prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)")
    .run(`${key}-membership`, wsId, user.id, role, Date.now());
  const res = await login({ request: apiReq("POST", "/auth/login", { body: { email: `${key}@x.com`, password: "password123" } }) });
  expect(res.status).toBe(200);
  return { userId: user.id, cookie: cookieFor(sessionTokenFrom(res)) };
}

async function env(): Promise<Env> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email: "matrix@x.com", name: "Owner", password: "longenough1" } }),
  });
  const owner = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie: owner, body: { name: "Matrix Ws", slug: "matrix-ws" }, test: true }),
  });
  const data = await bodyOf(wsRes);
  const wsId = data.workspace.id as string;
  const teamId = data.defaultTeamId as string;

  const otherRes = await createTeam({
    request: apiReq("POST", `/teams?wsId=${wsId}`, { cookie: owner, body: { key: "OTH", name: "Other" }, test: true }),
  });
  expect(otherRes.status).toBe(201);
  const otherTeamId = (await bodyOf(otherRes)).team.id as string;

  const guest = await addActor(wsId, "guest", "guest");
  sqlite
    .prepare("INSERT INTO team_members (id, team_id, user_id, created_at) VALUES (?,?,?,?)")
    .run("guest-team", teamId, guest.userId, Date.now());
  const member = await addActor(wsId, "mem", "member");
  const admin = await addActor(wsId, "adm", "admin");

  return { wsId, teamId, otherTeamId, owner, admin: admin.cookie, member: member.cookie, guest: guest.cookie, guestId: guest.userId };
}

async function expectForbidden(res: Response): Promise<void> {
  expect(res.status).toBe(403);
  expect((await bodyOf(res)).error).toEqual({
    code: "FORBIDDEN",
    message: "Requires member role or higher",
    details: [],
  });
}

function mkProject(wsId: string, cookie: string, name = "Alpha") {
  return createProject({ request: apiReq("POST", `/projects?wsId=${wsId}`, { cookie, body: { name }, test: true }) });
}

async function seedProject(e: Env, name = "Alpha"): Promise<string> {
  const res = await mkProject(e.wsId, e.owner, name);
  expect(res.status).toBe(201);
  return (await bodyOf(res)).project.id as string;
}

async function seedMilestone(e: Env, projectId: string, name = "M1"): Promise<string> {
  const res = await createMilestone({
    request: apiReq("POST", `/projects/${projectId}/milestones`, { cookie: e.owner, body: { name }, test: true }),
    params: { id: projectId },
  });
  expect(res.status).toBe(201);
  return (await bodyOf(res)).milestone.id as string;
}

async function seedUpdate(e: Env, projectId: string, cookie = e.owner): Promise<string> {
  const res = await createUpdate({
    request: apiReq("POST", `/projects/${projectId}/updates?wsId=${e.wsId}`, {
      cookie,
      body: { health: "on_track", bodyMd: "All good" },
      test: true,
    }),
    params: { id: projectId },
  });
  expect(res.status).toBe(201);
  return (await bodyOf(res)).update.id as string;
}

async function seedCycle(e: Env, teamId = e.teamId): Promise<string> {
  const res = await createCycle({
    request: apiReq("POST", `/cycles?wsId=${e.wsId}`, { cookie: e.owner, body: { teamId, ...activeWindow() }, test: true }),
  });
  expect(res.status).toBe(201);
  return (await bodyOf(res)).cycle.id as string;
}

function row<T>(sql: string, ...args: unknown[]): T {
  return sqlite.prepare(sql).get(...(args as never[])) as T;
}

function countOf(sql: string, ...args: unknown[]): number {
  return row<{ n: number }>(sql, ...args).n;
}

const PROJECT_COUNT = "SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ?";
const MILESTONE_COUNT = "SELECT COUNT(*) AS n FROM milestones WHERE project_id = ?";
const UPDATE_COUNT = "SELECT COUNT(*) AS n FROM project_updates WHERE project_id = ?";
const CYCLE_COUNT = "SELECT COUNT(*) AS n FROM cycles WHERE workspace_id = ?";

describe("guest matrix: projects", () => {
  it("denies guest create/patch/delete, keeps the read, lets member and admin through", async () => {
    const e = await env();
    const projectId = await seedProject(e);
    const before = countOf(PROJECT_COUNT, e.wsId);

    await expectForbidden(await mkProject(e.wsId, e.guest, "Guest project"));
    expect(countOf(PROJECT_COUNT, e.wsId)).toBe(before);

    await expectForbidden(
      await patchProject({
        request: apiReq("PATCH", `/projects/${projectId}?wsId=${e.wsId}`, { cookie: e.guest, body: { name: "Hijacked" }, test: true }),
        params: { id: projectId },
      }),
    );
    expect(row<{ name: string }>("SELECT name FROM projects WHERE id = ?", projectId).name).toBe("Alpha");

    await expectForbidden(
      await deleteProject({
        request: apiReq("DELETE", `/projects/${projectId}?wsId=${e.wsId}`, { cookie: e.guest, test: true }),
        params: { id: projectId },
      }),
    );
    expect(row<{ deleted_at: number | null }>("SELECT deleted_at FROM projects WHERE id = ?", projectId).deleted_at).toBeNull();

    const list = await listProjects({ request: apiReq("GET", `/projects?wsId=${e.wsId}`, { cookie: e.guest }) });
    expect(list.status).toBe(200);
    expect((await bodyOf(list)).data).toHaveLength(before);
    const one = await getProject({
      request: apiReq("GET", `/projects/${projectId}?wsId=${e.wsId}`, { cookie: e.guest }),
      params: { id: projectId },
    });
    expect(one.status).toBe(200);

    expect((await mkProject(e.wsId, e.member, "Member project")).status).toBe(201);
    const memberPatch = await patchProject({
      request: apiReq("PATCH", `/projects/${projectId}?wsId=${e.wsId}`, { cookie: e.member, body: { name: "Renamed" }, test: true }),
      params: { id: projectId },
    });
    expect(memberPatch.status).toBe(200);
    const adminDelete = await deleteProject({
      request: apiReq("DELETE", `/projects/${projectId}?wsId=${e.wsId}`, { cookie: e.admin, test: true }),
      params: { id: projectId },
    });
    expect(adminDelete.status).toBe(200);
  });
});

describe("guest matrix: milestones", () => {
  it("denies guest create/patch/delete, keeps the read, lets member and admin through", async () => {
    const e = await env();
    const projectId = await seedProject(e);
    const milestoneId = await seedMilestone(e, projectId);
    const before = countOf(MILESTONE_COUNT, projectId);

    await expectForbidden(
      await createMilestone({
        request: apiReq("POST", `/projects/${projectId}/milestones`, { cookie: e.guest, body: { name: "Guest ms" }, test: true }),
        params: { id: projectId },
      }),
    );
    expect(countOf(MILESTONE_COUNT, projectId)).toBe(before);

    await expectForbidden(
      await patchMilestone({
        request: apiReq("PATCH", `/milestones/${milestoneId}`, { cookie: e.guest, body: { name: "Hijacked" }, test: true }),
        params: { id: milestoneId },
      }),
    );
    expect(row<{ name: string }>("SELECT name FROM milestones WHERE id = ?", milestoneId).name).toBe("M1");

    await expectForbidden(
      await deleteMilestone({
        request: apiReq("DELETE", `/milestones/${milestoneId}`, { cookie: e.guest, test: true }),
        params: { id: milestoneId },
      }),
    );
    expect(row<{ deleted_at: number | null }>("SELECT deleted_at FROM milestones WHERE id = ?", milestoneId).deleted_at).toBeNull();

    const read = await listMilestones({
      request: apiReq("GET", `/projects/${projectId}/milestones`, { cookie: e.guest }),
      params: { id: projectId },
    });
    expect(read.status).toBe(200);
    expect((await bodyOf(read)).data).toHaveLength(before);

    const memberCreate = await createMilestone({
      request: apiReq("POST", `/projects/${projectId}/milestones`, { cookie: e.member, body: { name: "M2" }, test: true }),
      params: { id: projectId },
    });
    expect(memberCreate.status).toBe(201);
    const memberPatch = await patchMilestone({
      request: apiReq("PATCH", `/milestones/${milestoneId}`, { cookie: e.member, body: { name: "Renamed" }, test: true }),
      params: { id: milestoneId },
    });
    expect(memberPatch.status).toBe(200);
    const adminDelete = await deleteMilestone({
      request: apiReq("DELETE", `/milestones/${milestoneId}`, { cookie: e.admin, test: true }),
      params: { id: milestoneId },
    });
    expect(adminDelete.status).toBe(200);
  });
});

describe("guest matrix: project updates", () => {
  it("denies guest post/delete, keeps the read, lets member and admin through", async () => {
    const e = await env();
    const projectId = await seedProject(e);
    const updateId = await seedUpdate(e, projectId);
    const before = countOf(UPDATE_COUNT, projectId);

    await expectForbidden(
      await createUpdate({
        request: apiReq("POST", `/projects/${projectId}/updates?wsId=${e.wsId}`, {
          cookie: e.guest,
          body: { health: "off_track", bodyMd: "Guest report" },
          test: true,
        }),
        params: { id: projectId },
      }),
    );
    expect(countOf(UPDATE_COUNT, projectId)).toBe(before);

    await expectForbidden(
      await deleteUpdate({
        request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${e.wsId}`, { cookie: e.guest, test: true }),
        params: { id: updateId },
      }),
    );
    expect(countOf("SELECT COUNT(*) AS n FROM project_updates WHERE id = ?", updateId)).toBe(1);

    const read = await listUpdates({
      request: apiReq("GET", `/projects/${projectId}/updates?wsId=${e.wsId}`, { cookie: e.guest }),
      params: { id: projectId },
    });
    expect(read.status).toBe(200);
    expect((await bodyOf(read)).data).toHaveLength(before);

    const memberUpdateId = await seedUpdate(e, projectId, e.member);
    const memberDelete = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${memberUpdateId}?wsId=${e.wsId}`, { cookie: e.member, test: true }),
      params: { id: memberUpdateId },
    });
    expect(memberDelete.status).toBe(200);
    const adminDelete = await deleteUpdate({
      request: apiReq("DELETE", `/project-updates/${updateId}?wsId=${e.wsId}`, { cookie: e.admin, test: true }),
      params: { id: updateId },
    });
    expect(adminDelete.status).toBe(200);
  });
});

describe("guest matrix: cycles", () => {
  it("denies guest create/patch/scope/close and leaves every row unchanged", async () => {
    const e = await env();
    const cycleId = await seedCycle(e);
    const issueRes = await createIssue({
      request: apiReq("POST", `/issues?wsId=${e.wsId}`, { cookie: e.owner, body: { teamId: e.teamId, title: "Task" }, test: true }),
    });
    const issueId = (await bodyOf(issueRes)).issue.id as string;
    const before = countOf(CYCLE_COUNT, e.wsId);

    await expectForbidden(
      await createCycle({
        request: apiReq("POST", `/cycles?wsId=${e.wsId}`, { cookie: e.guest, body: { teamId: e.teamId, ...activeWindow() }, test: true }),
      }),
    );
    expect(countOf(CYCLE_COUNT, e.wsId)).toBe(before);

    await expectForbidden(
      await patchCycle({
        request: apiReq("PATCH", `/cycles/${cycleId}?wsId=${e.wsId}`, { cookie: e.guest, body: { name: "Hijacked" }, test: true }),
        params: { id: cycleId },
      }),
    );
    expect(row<{ name: string }>("SELECT name FROM cycles WHERE id = ?", cycleId).name).toBe("Cycle 1");

    await expectForbidden(
      await scopeCycle({
        request: apiReq("POST", `/cycles/${cycleId}/scope?wsId=${e.wsId}`, { cookie: e.guest, body: { add: [issueId] }, test: true }),
        params: { id: cycleId },
      }),
    );
    expect(row<{ cycle_id: string | null }>("SELECT cycle_id FROM issues WHERE id = ?", issueId).cycle_id).toBeNull();

    await expectForbidden(
      await closeCycle({
        request: apiReq("POST", `/cycles/${cycleId}/close?wsId=${e.wsId}`, { cookie: e.guest, test: true }),
        params: { id: cycleId },
      }),
    );
    const frozen = row<{ status: string; closed_at: number | null }>("SELECT status, closed_at FROM cycles WHERE id = ?", cycleId);
    expect(frozen.status).not.toBe("completed");
    expect(frozen.closed_at).toBeNull();
    expect(countOf(CYCLE_COUNT, e.wsId)).toBe(before);

    const memberScope = await scopeCycle({
      request: apiReq("POST", `/cycles/${cycleId}/scope?wsId=${e.wsId}`, { cookie: e.member, body: { add: [issueId] }, test: true }),
      params: { id: cycleId },
    });
    expect(memberScope.status).toBe(200);
    const memberPatch = await patchCycle({
      request: apiReq("PATCH", `/cycles/${cycleId}?wsId=${e.wsId}`, { cookie: e.member, body: { name: "Renamed" }, test: true }),
      params: { id: cycleId },
    });
    expect(memberPatch.status).toBe(200);
    const adminClose = await closeCycle({
      request: apiReq("POST", `/cycles/${cycleId}/close?wsId=${e.wsId}`, { cookie: e.admin, test: true }),
      params: { id: cycleId },
    });
    expect(adminClose.status).toBe(200);
    expect(row<{ status: string }>("SELECT status FROM cycles WHERE id = ?", cycleId).status).toBe("completed");
  });

  it("keeps the guest read team-scoped: own team 200, a team they are not on 404", async () => {
    const e = await env();
    await seedCycle(e);
    await seedCycle(e, e.otherTeamId);

    const mine = await listCycles({ request: apiReq("GET", `/cycles?wsId=${e.wsId}&teamId=${e.teamId}`, { cookie: e.guest }) });
    expect(mine.status).toBe(200);
    expect((await bodyOf(mine)).data).toHaveLength(1);

    const theirs = await listCycles({ request: apiReq("GET", `/cycles?wsId=${e.wsId}&teamId=${e.otherTeamId}`, { cookie: e.guest }) });
    expect(theirs.status).toBe(404);
    expect((await bodyOf(theirs)).error.code).toBe("NOT_FOUND");

    const asMember = await listCycles({ request: apiReq("GET", `/cycles?wsId=${e.wsId}&teamId=${e.otherTeamId}`, { cookie: e.member }) });
    expect(asMember.status).toBe(200);
    const asAdmin = await listCycles({ request: apiReq("GET", `/cycles?wsId=${e.wsId}&teamId=${e.teamId}`, { cookie: e.admin }) });
    expect(asAdmin.status).toBe(200);
  });
});
