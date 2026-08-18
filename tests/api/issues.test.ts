/** Issues API: CRUD, identifiers, version conflict, move-team, relations, bulk/undo. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { GET as listIssues, POST as createIssue } from "@/pages/api/issues/index";
import { GET as getIssue, PATCH as patchIssue, DELETE as deleteIssue } from "@/pages/api/issues/[id]/index";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function env(): Promise<{ wsId: string; teamId: string; cookie: string; userId: string }> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email: "iss@x.com", name: "Issuer", password: "longenough1" } }),
  });
  const token = sessionTokenFrom(res);
  const cookie = cookieFor(token);
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Issue Ws", slug: "issue-ws" }, test: true }),
  });
  const data = await bodyOf(wsRes);
  const user = sqlite.prepare("SELECT id FROM users WHERE email = ?").get("iss@x.com") as { id: string };
  return { wsId: data.workspace.id, teamId: data.defaultTeamId, cookie, userId: user.id };
}

function q(wsId: string, extra = ""): string {
  return `wsId=${wsId}${extra}`;
}

describe("issues CRUD", () => {
  it("allocates PRO-1 then PRO-2; create returns empty suggestions", async () => {
    const { wsId, teamId, cookie } = await env();
    const a = await createIssue({
      request: apiReq("POST", `/issues?${q(wsId)}`, { cookie, body: { teamId, title: "First" }, test: true }),
    });
    expect(a.status).toBe(201);
    const bodyA = await bodyOf(a);
    expect(bodyA.issue.identifier).toBe("PRO-1");
    expect(bodyA.suggestions).toEqual([]);

    const b = await createIssue({
      request: apiReq("POST", `/issues?${q(wsId)}`, { cookie, body: { teamId, title: "Second" }, test: true }),
    });
    expect((await bodyOf(b)).issue.identifier).toBe("PRO-2");

    const fts = sqlite.prepare("SELECT title FROM search_fts WHERE entity_id = ?").get(bodyA.issue.id) as { title: string };
    expect(fts.title).toBe("First");
  });

  it("GET by identifier, PATCH bumps version, expectedVersion mismatch is 409", async () => {
    const { wsId, teamId, cookie } = await env();
    const created = await bodyOf(
      await createIssue({
        request: apiReq("POST", `/issues?${q(wsId)}`, { cookie, body: { teamId, title: "V" }, test: true }),
      }),
    );
    const got = await getIssue({
      request: apiReq("GET", `/issues/PRO-1?${q(wsId)}`, { cookie }),
      params: { id: "PRO-1" },
    });
    expect((await bodyOf(got)).issue.id).toBe(created.issue.id);

    const conflict = await patchIssue({
      request: apiReq("PATCH", `/issues/PRO-1?${q(wsId)}&expectedVersion=99`, {
        cookie,
        body: { title: "Nope" },
        test: true,
      }),
      params: { id: "PRO-1" },
    });
    expect(conflict.status).toBe(409);

    const ok = await patchIssue({
      request: apiReq("PATCH", `/issues/PRO-1?${q(wsId)}&expectedVersion=1`, {
        cookie,
        body: { title: "Renamed" },
        test: true,
      }),
      params: { id: "PRO-1" },
    });
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).issue.version).toBe(2);

    const listed = await listIssues({ request: apiReq("GET", `/issues?${q(wsId)}`, { cookie }) });
    expect((await bodyOf(listed)).data).toHaveLength(1);
  });

  it("soft-deletes; list omits trash", async () => {
    const { wsId, teamId, cookie } = await env();
    await createIssue({
      request: apiReq("POST", `/issues?${q(wsId)}`, { cookie, body: { teamId, title: "Gone" }, test: true }),
    });
    const del = await deleteIssue({
      request: apiReq("DELETE", `/issues/PRO-1?${q(wsId)}`, { cookie, test: true }),
      params: { id: "PRO-1" },
    });
    expect(del.status).toBe(200);
    const listed = await listIssues({ request: apiReq("GET", `/issues?${q(wsId)}`, { cookie }) });
    expect((await bodyOf(listed)).data).toHaveLength(0);
  });
});
