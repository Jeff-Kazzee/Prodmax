/**
 * T-028. Projects can be reordered through the PATCH.
 *
 * `projects.position` is a fractional key, `listProjects` already ordered by
 * it, and `createProject` allocated one, but nothing could change it: the
 * patch schema had no `position` and `updateProject` had no branch for one.
 * So the S-15 list shipped without a drag, because a handle that persists
 * nowhere is a control wired to nothing.
 *
 * This mirrors the milestone convention rather than inventing a second one.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { GET as listProjects, POST as createProject } from "@/pages/api/projects/index";
import { PATCH as patchProject } from "@/pages/api/projects/[id]";
import { generateKeyBetween } from "@/db/positions";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

beforeEach(() => {
  createApiDb();
});
afterEach(teardownApiDb);

interface ProjectPayload {
  id: string;
  name: string;
  position: string;
}

async function env(email: string, slug: string): Promise<{ wsId: string; cookie: string }> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "P", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Reorder Ws", slug }, test: true }),
  });
  return { wsId: (await bodyOf(wsRes)).workspace.id as string, cookie };
}

async function makeProject(cookie: string, wsId: string, name: string): Promise<ProjectPayload> {
  const res = await createProject({
    request: apiReq("POST", `/projects?wsId=${wsId}`, { cookie, body: { name }, test: true }),
  });
  expect(res.status).toBe(201);
  return (await bodyOf(res)).project as ProjectPayload;
}

async function order(cookie: string, wsId: string): Promise<string[]> {
  const res = await listProjects({ request: apiReq("GET", `/projects?wsId=${wsId}`, { cookie }) });
  expect(res.status).toBe(200);
  return ((await bodyOf(res)).data as ProjectPayload[]).map((p) => p.name);
}

async function patch(
  cookie: string,
  wsId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return patchProject({
    request: apiReq("PATCH", `/projects/${id}?wsId=${wsId}`, { cookie, body, test: true }),
    params: { id },
  });
}

describe("project reorder", () => {
  it("moves a project between two siblings and reads it back there", async () => {
    const ws = await env("reorder1@x.com", "reorder-1");
    const first = await makeProject(ws.cookie, ws.wsId, "Alpha");
    const second = await makeProject(ws.cookie, ws.wsId, "Beta");
    const third = await makeProject(ws.cookie, ws.wsId, "Gamma");

    expect(await order(ws.cookie, ws.wsId)).toEqual(["Alpha", "Beta", "Gamma"]);

    // Gamma moves between Alpha and Beta. A midpoint key is the point of a
    // fractional index: no sibling row has to be rewritten.
    const between = generateKeyBetween(first.position, second.position);
    const res = await patch(ws.cookie, ws.wsId, third.id, { position: between });
    expect(res.status).toBe(200);

    expect(await order(ws.cookie, ws.wsId)).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  it("leaves the order alone when the patch omits a position", async () => {
    // Without this, a service that reset position on every write would still
    // pass the reorder test above.
    const ws = await env("reorder2@x.com", "reorder-2");
    await makeProject(ws.cookie, ws.wsId, "Alpha");
    const second = await makeProject(ws.cookie, ws.wsId, "Beta");
    await makeProject(ws.cookie, ws.wsId, "Gamma");

    const res = await patch(ws.cookie, ws.wsId, second.id, { name: "Beta renamed" });
    expect(res.status).toBe(200);

    expect(await order(ws.cookie, ws.wsId)).toEqual(["Alpha", "Beta renamed", "Gamma"]);
  });

  it("rejects a malformed key with the error shape from §3", async () => {
    const ws = await env("reorder3@x.com", "reorder-3");
    const project = await makeProject(ws.cookie, ws.wsId, "Alpha");

    const res = await patch(ws.cookie, ws.wsId, project.id, { position: "not a key!" });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error?.code).toBe("VALIDATION");

    // The stored key must survive a rejected write.
    const after = await listProjects({
      request: apiReq("GET", `/projects?wsId=${ws.wsId}`, { cookie: ws.cookie }),
    });
    const rows = (await bodyOf(after)).data as ProjectPayload[];
    expect(rows[0]?.position).toBe(project.position);
  });

  it("keeps reorder inside the workspace", async () => {
    // §7: every query is workspace-scoped, and a position means nothing across
    // workspaces.
    const a = await env("reorder4a@x.com", "reorder-4a");
    const b = await env("reorder4b@x.com", "reorder-4b");
    const mine = await makeProject(a.cookie, a.wsId, "Alpha");

    const res = await patch(b.cookie, b.wsId, mine.id, { position: "a1" });
    expect(res.status).toBe(404);
  });
});
