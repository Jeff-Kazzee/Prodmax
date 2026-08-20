/**
 * T-029. A project star is per-user.
 *
 * ux-spec §4.15 PJ-01 puts a star on the project header and nothing supported
 * it. The obvious shortcut was a boolean on `projects`, copying `views.favorited`.
 * That is wrong for anything more than one person touches, because it makes a
 * star a property of the thing rather than of the viewer, and the isolation
 * test below is the one that would fail under it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { GET as listProjects, POST as createProject } from "@/pages/api/projects/index";
import { GET as getProject } from "@/pages/api/projects/[id]";
import { POST as favorite } from "@/pages/api/projects/[id]/favorite";
import { uuid7 } from "@/db/ids";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function user(email: string): Promise<{ cookie: string; userId: string }> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "U", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const userId = (await bodyOf(res)).user.id as string;
  return { cookie, userId };
}

/**
 * Add a second member directly. The invite flow has its own tests; going
 * through it here would make a favorites failure look like an invite failure.
 */
function addMember(wsId: string, userId: string): void {
  sqlite
    .prepare(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(uuid7(), wsId, userId, "member", Date.now());
}

async function workspace(cookie: string, slug: string): Promise<string> {
  const res = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Fav Ws", slug }, test: true }),
  });
  return (await bodyOf(res)).workspace.id as string;
}

async function project(cookie: string, wsId: string, name: string): Promise<string> {
  const res = await createProject({
    request: apiReq("POST", `/projects?wsId=${wsId}`, { cookie, body: { name }, test: true }),
  });
  return (await bodyOf(res)).project.id as string;
}

async function toggle(cookie: string, wsId: string, id: string): Promise<Response> {
  return favorite({
    request: apiReq("POST", `/projects/${id}/favorite?wsId=${wsId}`, { cookie, test: true }),
    params: { id },
  });
}

async function readFavorited(cookie: string, wsId: string, id: string): Promise<boolean> {
  const res = await getProject({
    request: apiReq("GET", `/projects/${id}?wsId=${wsId}`, { cookie }),
    params: { id },
  });
  return (await bodyOf(res)).project.favorited as boolean;
}

describe("project favorites", () => {
  it("toggles on and back off, reporting the state after the write", async () => {
    const owner = (await user("fav1@x.com")).cookie;
    const wsId = await workspace(owner, "fav-1");
    const id = await project(owner, wsId, "Alpha");

    expect(await readFavorited(owner, wsId, id)).toBe(false);

    const on = await toggle(owner, wsId, id);
    expect(on.status).toBe(200);
    expect((await bodyOf(on)).favorited).toBe(true);
    expect(await readFavorited(owner, wsId, id)).toBe(true);

    const off = await toggle(owner, wsId, id);
    expect((await bodyOf(off)).favorited).toBe(false);
    expect(await readFavorited(owner, wsId, id)).toBe(false);
  });

  it("does not show one member's star to another", async () => {
    // The reason this is a table and not a column. A boolean on `projects`
    // passes every other test in this file and fails only here.
    const owner = (await user("fav2@x.com")).cookie;
    const wsId = await workspace(owner, "fav-2");
    const id = await project(owner, wsId, "Alpha");
    const second = await user("fav2b@x.com");
    addMember(wsId, second.userId);
    const other = second.cookie;

    await toggle(owner, wsId, id);

    expect(await readFavorited(owner, wsId, id)).toBe(true);
    expect(await readFavorited(other, wsId, id)).toBe(false);
  });

  it("carries the caller's own stars through the list", async () => {
    const owner = (await user("fav3@x.com")).cookie;
    const wsId = await workspace(owner, "fav-3");
    const starred = await project(owner, wsId, "Starred");
    await project(owner, wsId, "Plain");

    await toggle(owner, wsId, starred);

    const res = await listProjects({ request: apiReq("GET", `/projects?wsId=${wsId}`, { cookie: owner }) });
    const rows = (await bodyOf(res)).data as Array<{ name: string; favorited: boolean }>;
    expect(rows.find((r) => r.name === "Starred")?.favorited).toBe(true);
    expect(rows.find((r) => r.name === "Plain")?.favorited).toBe(false);
  });

  it("refuses a project from another workspace", async () => {
    const a = (await user("fav4a@x.com")).cookie;
    const wsA = await workspace(a, "fav-4a");
    const mine = await project(a, wsA, "Alpha");

    const b = (await user("fav4b@x.com")).cookie;
    const wsB = await workspace(b, "fav-4b");

    const res = await toggle(b, wsB, mine);
    expect(res.status).toBe(404);
  });
});
