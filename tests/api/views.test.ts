/** Views API + filter AST compile (depth, injection rejected). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createIssue } from "@/pages/api/issues/index";
import { GET as listIssues } from "@/pages/api/issues/index";
import { GET as listViews, POST as createView } from "@/pages/api/views/index";
import { PATCH as patchView, DELETE as deleteView } from "@/pages/api/views/[id]/index";
import { POST as favoriteView } from "@/pages/api/views/[id]/favorite";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function env() {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email: "view@x.com", name: "Viewer", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "View Ws", slug: "view-ws" }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id as string, teamId: data.defaultTeamId as string, cookie };
}

describe("views", () => {
  it("CRUD + favorite toggle", async () => {
    const { wsId, cookie } = await env();
    const created = await createView({
      request: apiReq("POST", `/views?wsId=${wsId}`, {
        cookie,
        body: { name: "Bugs", layout: "list", filters: { field: "priority", op: "eq", value: 4 } },
        test: true,
      }),
    });
    expect(created.status).toBe(201);
    const view = (await bodyOf(created)).view;
    expect(view.filters).toEqual({ field: "priority", op: "eq", value: 4 });

    const patched = await patchView({
      request: apiReq("PATCH", `/views/${view.id}?wsId=${wsId}`, { cookie, body: { name: "Urgent" }, test: true }),
      params: { id: view.id },
    });
    expect((await bodyOf(patched)).view.name).toBe("Urgent");

    const fav = await favoriteView({
      request: apiReq("POST", `/views/${view.id}/favorite?wsId=${wsId}`, { cookie, test: true }),
      params: { id: view.id },
    });
    expect((await bodyOf(fav)).favorited).toBe(true);
    const listed = await bodyOf(await listViews({ request: apiReq("GET", `/views?wsId=${wsId}`, { cookie }) }));
    expect(listed.data[0].favorited).toBe(true);

    const unfav = await favoriteView({
      request: apiReq("POST", `/views/${view.id}/favorite?wsId=${wsId}`, { cookie, test: true }),
      params: { id: view.id },
    });
    expect((await bodyOf(unfav)).favorited).toBe(false);

    const del = await deleteView({
      request: apiReq("DELETE", `/views/${view.id}?wsId=${wsId}`, { cookie, test: true }),
      params: { id: view.id },
    });
    expect(del.status).toBe(200);
  });
});

describe("filter compile", () => {
  it("eq/and/or/not depth-3 compile; injection-shaped field is rejected", async () => {
    const { wsId, teamId, cookie } = await env();
    await createIssue({
      request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Low", priority: 1 }, test: true }),
    });
    await createIssue({
      request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Urgent", priority: 4 }, test: true }),
    });

    const filters = encodeURIComponent(JSON.stringify({ field: "priority", op: "eq", value: 4 }));
    const filtered = await listIssues({ request: apiReq("GET", `/issues?wsId=${wsId}&filters=${filters}`, { cookie }) });
    const rows = (await bodyOf(filtered)).data as Array<{ title: string }>;
    expect(rows.map((r) => r.title)).toEqual(["Urgent"]);

    const grouped = {
      combinator: "or",
      not: false,
      children: [
        { field: "priority", op: "eq", value: 1 },
        {
          combinator: "and",
          children: [
            { field: "priority", op: "eq", value: 4 },
            { combinator: "and", children: [{ field: "identifier", op: "eq", value: "PRO-2" }] },
          ],
        },
      ],
    };
    const ok = await listIssues({
      request: apiReq("GET", `/issues?wsId=${wsId}&filters=${encodeURIComponent(JSON.stringify(grouped))}`, { cookie }),
    });
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).data).toHaveLength(2);

    const tooDeep = {
      combinator: "and",
      children: [
        {
          combinator: "and",
          children: [
            {
              combinator: "and",
              children: [{ combinator: "and", children: [{ field: "priority", op: "eq", value: 1 }] }],
            },
          ],
        },
      ],
    };
    const deep = await listIssues({
      request: apiReq("GET", `/issues?wsId=${wsId}&filters=${encodeURIComponent(JSON.stringify(tooDeep))}`, { cookie }),
    });
    expect(deep.status).toBe(400);

    const injected = encodeURIComponent(
      JSON.stringify({ field: "team; DROP TABLE issues; --", op: "eq", value: "x" }),
    );
    const bad = await listIssues({ request: apiReq("GET", `/issues?wsId=${wsId}&filters=${injected}`, { cookie }) });
    expect(bad.status).toBe(400);
    const stillThere = sqlite.prepare("SELECT count(*) AS n FROM issues").get() as { n: number };
    expect(stillThere.n).toBe(2);

    const sqliValue = encodeURIComponent(
      JSON.stringify({ field: "identifier", op: "eq", value: "PRO-1'; DROP TABLE issues; --" }),
    );
    const val = await listIssues({ request: apiReq("GET", `/issues?wsId=${wsId}&filters=${sqliValue}`, { cookie }) });
    expect(val.status).toBe(200);
    expect((await bodyOf(val)).data).toHaveLength(0);
    expect((sqlite.prepare("SELECT count(*) AS n FROM issues").get() as { n: number }).n).toBe(2);
  });
});
