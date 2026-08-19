/**
 * Cross-workspace parenting (T-005 remediation phase 7).
 *
 * The foreign keys on projectId, milestoneId, and cycleId only require the row
 * to exist somewhere, so before this a member of one workspace could attach an
 * issue to another workspace's project and the reference stood. Phase 2
 * hardened the counter query. This stops the id at the door.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createProject } from "@/pages/api/projects/index";
import { POST as createIssueRoute } from "@/pages/api/issues/index";
import { PATCH as patchIssue } from "@/pages/api/issues/[id]/index";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

interface Tenant {
  wsId: string;
  teamId: string;
  cookie: string;
}

async function tenant(email: string, slug: string): Promise<Tenant> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "T", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: slug, slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id, teamId: data.defaultTeamId, cookie };
}

async function mkProject(t: Tenant, name: string): Promise<string> {
  const res = await createProject({
    request: apiReq("POST", `/projects?wsId=${t.wsId}`, { cookie: t.cookie, body: { name }, test: true }),
  });
  return (await bodyOf(res)).project.id as string;
}

describe("parenting ids are rejected across workspaces", () => {
  it("refuses a foreign projectId on create and stores nothing", async () => {
    const a = await tenant("a@x.com", "tenant-a");
    const b = await tenant("b@x.com", "tenant-b");
    const foreign = await mkProject(b, "B's project");

    const res = await createIssueRoute({
      request: apiReq("POST", `/issues?wsId=${a.wsId}`, {
        cookie: a.cookie,
        body: { teamId: a.teamId, title: "cross tenant", projectId: foreign },
        test: true,
      }),
    });

    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error).toEqual({
      code: "VALIDATION",
      message: "Not a valid project for this workspace",
      details: [`projectId: ${foreign}`],
    });
    expect(sqlite.prepare("SELECT count(*) AS n FROM issues WHERE project_id = ?").get(foreign)).toEqual({ n: 0 });
  });

  it("refuses a foreign projectId on patch and leaves the issue alone", async () => {
    const a = await tenant("a2@x.com", "tenant-a2");
    const b = await tenant("b2@x.com", "tenant-b2");
    const foreign = await mkProject(b, "B's project");
    const mine = await mkProject(a, "A's project");

    const created = await createIssueRoute({
      request: apiReq("POST", `/issues?wsId=${a.wsId}`, {
        cookie: a.cookie,
        body: { teamId: a.teamId, title: "mine", projectId: mine },
        test: true,
      }),
    });
    const id = (await bodyOf(created)).issue.id as string;
    const historyCount = (): number =>
      (sqlite.prepare("SELECT count(*) AS n FROM issue_history WHERE issue_id = ?").get(id) as { n: number }).n;
    const historyBefore = historyCount();

    const res = await patchIssue({
      request: apiReq("PATCH", `/issues/${id}?wsId=${a.wsId}`, {
        cookie: a.cookie,
        body: { projectId: foreign },
        test: true,
      }),
      params: { id },
    });

    expect(res.status).toBe(400);
    const row = sqlite.prepare("SELECT project_id AS p, version AS v FROM issues WHERE id = ?").get(id) as {
      p: string;
      v: number;
    };
    expect(row.p).toBe(mine);
    expect(row.v).toBe(1);
    expect(historyCount()).toBe(historyBefore);
  });

  it("refuses a nonexistent id without saying whether it exists elsewhere", async () => {
    const a = await tenant("a3@x.com", "tenant-a3");

    const res = await createIssueRoute({
      request: apiReq("POST", `/issues?wsId=${a.wsId}`, {
        cookie: a.cookie,
        body: { teamId: a.teamId, title: "ghost", projectId: "does-not-exist" },
        test: true,
      }),
    });

    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.message).toBe("Not a valid project for this workspace");
  });

  it("still accepts an id from the caller's own workspace", async () => {
    const a = await tenant("a4@x.com", "tenant-a4");
    const mine = await mkProject(a, "A's project");

    const res = await createIssueRoute({
      request: apiReq("POST", `/issues?wsId=${a.wsId}`, {
        cookie: a.cookie,
        body: { teamId: a.teamId, title: "ok", projectId: mine },
        test: true,
      }),
    });

    expect(res.status).toBe(201);
    expect((await bodyOf(res)).issue.projectId).toBe(mine);
  });
});
