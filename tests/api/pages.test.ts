/**
 * Pages API: the sidebar tree, subtree move under a depth cap with cycle
 * detection, the 30-day trash and its restore cohort, and the §7 guest gate.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as listPages, POST as createPage } from "@/pages/api/pages/index";
import { GET as getTree } from "@/pages/api/pages/tree";
import { GET as getPage, PATCH as patchPage, DELETE as deletePage } from "@/pages/api/pages/[id]/index";
import { POST as restore } from "@/pages/api/pages/[id]/restore";
import { GET as getBlocks } from "@/pages/api/pages/[id]/blocks/index";
import { GET as listTemplates } from "@/pages/api/templates/index";
import { apiReq, bodyOf, createApiDb, teardownApiDb } from "./helpers";
import { addActor, docsEnv, type DocsEnv } from "./pages-harness";

let sqlite: Database.Database;
let env: DocsEnv;

beforeEach(async () => {
  sqlite = createApiDb();
  env = await docsEnv();
});
afterEach(teardownApiDb);

async function mkPage(body: Record<string, unknown>, cookie = env.cookie) {
  const res = await createPage({
    request: apiReq("POST", `/pages?wsId=${env.wsId}`, { cookie, body, test: true }),
  });
  return { res, body: await bodyOf(res) };
}

async function newPage(title: string, parentId?: string): Promise<string> {
  const { res, body } = await mkPage({ title, ...(parentId ? { parentId } : {}) });
  expect(res.status).toBe(201);
  return body.page.id as string;
}

async function patch(id: string, body: Record<string, unknown>) {
  const res = await patchPage({
    request: apiReq("PATCH", `/pages/${id}?wsId=${env.wsId}`, { cookie: env.cookie, body, test: true }),
    params: { id },
  });
  return { res, body: await bodyOf(res) };
}

function rowOf(id: string) {
  return sqlite.prepare("SELECT id, parent_id, path, depth, deleted_at FROM pages WHERE id = ?").get(id) as {
    id: string;
    parent_id: string | null;
    path: string;
    depth: number;
    deleted_at: number | null;
  };
}

describe("page tree (§9, O(visible))", () => {
  it("returns roots only until a node is expanded", async () => {
    const parent = await newPage("Parent");
    const child = await newPage("Child", parent);

    const collapsed = await getTree({ request: apiReq("GET", `/pages/tree?wsId=${env.wsId}`, { cookie: env.cookie }) });
    const collapsedIds = (await bodyOf(collapsed)).data.map((n: { id: string }) => n.id);
    expect(collapsedIds).toEqual([parent]);

    const expanded = await getTree({
      request: apiReq("GET", `/pages/tree?wsId=${env.wsId}&expanded=${parent}`, { cookie: env.cookie }),
    });
    const nodes = (await bodyOf(expanded)).data as Array<{ id: string; hasChildren: boolean }>;
    expect(nodes.map((n) => n.id).sort()).toEqual([parent, child].sort());
    expect(nodes.find((n) => n.id === parent)?.hasChildren).toBe(true);
    expect(nodes.find((n) => n.id === child)?.hasChildren).toBe(false);
  });
});

describe("move rewrites the whole subtree", () => {
  it("recomputes path and depth for every descendant, not just the moved node", async () => {
    const a = await newPage("A");
    const b = await newPage("B", a);
    const c = await newPage("C", b);
    const target = await newPage("Target");

    expect(rowOf(c).path).toBe(`/${a}/${b}/${c}`);
    expect(rowOf(c).depth).toBe(2);

    const { res } = await patch(a, { parentId: target });
    expect(res.status).toBe(200);

    // The grandchild is the assertion that matters: a rewrite scoped to direct
    // children would leave this path stale while the test still looked green.
    expect(rowOf(a).path).toBe(`/${target}/${a}`);
    expect(rowOf(b).path).toBe(`/${target}/${a}/${b}`);
    expect(rowOf(c).path).toBe(`/${target}/${a}/${b}/${c}`);
    expect(rowOf(a).depth).toBe(1);
    expect(rowOf(b).depth).toBe(2);
    expect(rowOf(c).depth).toBe(3);
  });

  it("refuses a move into the page's own subtree", async () => {
    const a = await newPage("A");
    const b = await newPage("B", a);
    const { res, body } = await patch(a, { parentId: b });
    expect(res.status).toBe(409);
    expect(body.error.message).toBe("A page cannot be moved into its own subtree");
    expect(rowOf(a).parent_id).toBeNull();
  });

  it("refuses a move onto itself", async () => {
    const a = await newPage("A");
    expect((await patch(a, { parentId: a })).res.status).toBe(409);
  });

  it("applies the depth cap to the deepest descendant, not to the moved node", async () => {
    // A chain at depths 0..19, so its last node sits exactly on the cap.
    let previous = await newPage("d0");
    const chain = [previous];
    for (let d = 1; d <= 19; d++) {
      previous = await newPage(`d${d}`, previous);
      chain.push(previous);
    }
    expect(rowOf(chain[19]).depth).toBe(19);

    const root = await newPage("movable");
    const leaf = await newPage("movable child", root);
    expect(rowOf(leaf).depth).toBe(1);

    // Under d19 the moved node lands at 20 (legal) but its child at 21. A cap
    // that only looked at the node being dragged would allow this.
    const tooDeep = await patch(root, { parentId: chain[19] });
    expect(tooDeep.res.status).toBe(400);
    expect(tooDeep.body.error.message).toBe("Page depth cap is 20");
    expect(rowOf(root).parent_id).toBeNull();

    // One level higher the same subtree fits exactly.
    const fits = await patch(root, { parentId: chain[18] });
    expect(fits.res.status).toBe(200);
    expect(rowOf(leaf).depth).toBe(20);
  });

  it("is a fixed point when replayed", async () => {
    const a = await newPage("A");
    const b = await newPage("B", a);
    const target = await newPage("T");
    await patch(a, { parentId: target });
    const first = rowOf(b);
    await patch(a, { parentId: target });
    expect(rowOf(b)).toEqual(first);
  });
});

describe("trash and restore (FM-050)", () => {
  it("restores exactly the cohort its own delete took", async () => {
    const parent = await newPage("Parent");
    const early = await newPage("Deleted first", parent);
    const together = await newPage("Deleted with the parent", parent);

    // The child is trashed on its own, before the parent.
    expect(
      (
        await deletePage({
          request: apiReq("DELETE", `/pages/${early}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
          params: { id: early },
        })
      ).status,
    ).toBe(200);
    const earlyStamp = rowOf(early).deleted_at;
    expect(earlyStamp).not.toBeNull();

    // Then the parent, which takes only the still-live descendants.
    await deletePage({
      request: apiReq("DELETE", `/pages/${parent}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: parent },
    });
    expect(rowOf(parent).deleted_at).not.toBe(earlyStamp);
    expect(rowOf(together).deleted_at).toBe(rowOf(parent).deleted_at);
    expect(rowOf(early).deleted_at).toBe(earlyStamp);

    const res = await restore({
      request: apiReq("POST", `/pages/${parent}/restore?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: parent },
    });
    expect(res.status).toBe(200);

    expect(rowOf(parent).deleted_at).toBeNull();
    expect(rowOf(together).deleted_at).toBeNull();
    // The one that matters: it was already in the trash before this delete ran,
    // so this restore must not have picked it up.
    expect(rowOf(early).deleted_at).toBe(earlyStamp);
  });

  it("gives two deletes in the same millisecond different stamps", async () => {
    const one = await newPage("one");
    const two = await newPage("two");
    for (const id of [one, two]) {
      await deletePage({
        request: apiReq("DELETE", `/pages/${id}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
        params: { id },
      });
    }
    expect(rowOf(one).deleted_at).not.toBe(rowOf(two).deleted_at);
  });

  it("reparents a restored page to the root when its parent is still trashed", async () => {
    const parent = await newPage("Parent");
    const child = await newPage("Child", parent);
    await deletePage({
      request: apiReq("DELETE", `/pages/${parent}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: parent },
    });
    await restore({
      request: apiReq("POST", `/pages/${child}/restore?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: child },
    });
    expect(rowOf(child).deleted_at).toBeNull();
    expect(rowOf(child).parent_id).toBeNull();
    expect(rowOf(child).path).toBe(`/${child}`);
    expect(rowOf(parent).deleted_at).not.toBeNull();
  });

  it("lists one row per delete operation, not one per trashed page", async () => {
    const parent = await newPage("Parent");
    await newPage("Child", parent);
    await deletePage({
      request: apiReq("DELETE", `/pages/${parent}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: parent },
    });
    const res = await listPages({
      request: apiReq("GET", `/pages?wsId=${env.wsId}&trashed=true`, { cookie: env.cookie }),
    });
    const data = (await bodyOf(res)).data as Array<{ id: string }>;
    expect(data.map((p) => p.id)).toEqual([parent]);
  });

  it("keeps a trashed page readable so the restore card can render (PE-05)", async () => {
    const id = await newPage("Gone");
    await deletePage({
      request: apiReq("DELETE", `/pages/${id}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id },
    });
    const res = await getPage({
      request: apiReq("GET", `/pages/${id}?wsId=${env.wsId}`, { cookie: env.cookie }),
      params: { id },
    });
    expect(res.status).toBe(200);
    const page = (await bodyOf(res)).page;
    expect(page.deletedAt).not.toBeNull();
    expect(page.expiresAt).toBe(page.deletedAt + 30 * 24 * 60 * 60 * 1000);
  });
});

describe("guests have no Docs access (§7)", () => {
  it("returns 403, not 404, on every docs surface", async () => {
    const pageId = await newPage("Members only");
    const guest = await addActor(sqlite, env.wsId, "guest", "guest");
    const q = `wsId=${env.wsId}`;

    const calls: Array<[string, () => Promise<Response>]> = [
      ["GET /pages", () => listPages({ request: apiReq("GET", `/pages?${q}`, { cookie: guest.cookie }) })],
      ["GET /pages/tree", () => getTree({ request: apiReq("GET", `/pages/tree?${q}`, { cookie: guest.cookie }) })],
      [
        "POST /pages",
        () => createPage({ request: apiReq("POST", `/pages?${q}`, { cookie: guest.cookie, body: {}, test: true }) }),
      ],
      [
        "GET /pages/:id",
        () =>
          getPage({
            request: apiReq("GET", `/pages/${pageId}?${q}`, { cookie: guest.cookie }),
            params: { id: pageId },
          }),
      ],
      [
        "PATCH /pages/:id",
        () =>
          patchPage({
            request: apiReq("PATCH", `/pages/${pageId}?${q}`, { cookie: guest.cookie, body: { title: "x" }, test: true }),
            params: { id: pageId },
          }),
      ],
      [
        "DELETE /pages/:id",
        () =>
          deletePage({
            request: apiReq("DELETE", `/pages/${pageId}?${q}`, { cookie: guest.cookie, test: true }),
            params: { id: pageId },
          }),
      ],
      [
        "POST /pages/:id/restore",
        () =>
          restore({
            request: apiReq("POST", `/pages/${pageId}/restore?${q}`, { cookie: guest.cookie, test: true }),
            params: { id: pageId },
          }),
      ],
      [
        "GET /pages/:id/blocks",
        () =>
          getBlocks({
            request: apiReq("GET", `/pages/${pageId}/blocks?${q}`, { cookie: guest.cookie }),
            params: { id: pageId },
          }),
      ],
      ["GET /templates", () => listTemplates({ request: apiReq("GET", `/templates?${q}`, { cookie: guest.cookie }) })],
    ];

    for (const [label, call] of calls) {
      const res = await call();
      expect(res.status, `${label} should be 403 for a guest`).toBe(403);
      expect((await bodyOf(res)).error.code, label).toBe("FORBIDDEN");
    }
  });

  it("still lets a member through the same surfaces", async () => {
    const pageId = await newPage("Members only");
    const member = await addActor(sqlite, env.wsId, "member", "member");
    const res = await getBlocks({
      request: apiReq("GET", `/pages/${pageId}/blocks?wsId=${env.wsId}`, { cookie: member.cookie }),
      params: { id: pageId },
    });
    // Without this the guest assertions would pass against a gate that simply
    // refuses everyone.
    expect(res.status).toBe(200);
  });
});
