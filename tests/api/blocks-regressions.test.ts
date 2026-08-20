/**
 * Regressions found by the T-007 multi-model review, one test per defect.
 *
 * Each of these was a real, reproduced failure against a tree whose four gates
 * were green, which is why they get their own file rather than being folded
 * into the suites that missed them.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as createPage } from "@/pages/api/pages/index";
import { GET as getBlocks, POST as postBlock } from "@/pages/api/pages/[id]/blocks/index";
import { POST as postBatch } from "@/pages/api/pages/[id]/blocks/batch";
import { PATCH as patchBlock, DELETE as deleteBlock } from "@/pages/api/blocks/[id]";
import { apiReq, bodyOf, createApiDb, teardownApiDb } from "./helpers";
import { docsEnv, rt, type DocsEnv } from "./pages-harness";

let sqlite: Database.Database;
let env: DocsEnv;

beforeEach(async () => {
  sqlite = createApiDb();
  env = await docsEnv();
});
afterEach(teardownApiDb);

async function newPage(title = "P"): Promise<string> {
  const res = await createPage({
    request: apiReq("POST", `/pages?wsId=${env.wsId}`, { cookie: env.cookie, body: { title }, test: true }),
  });
  return (await bodyOf(res)).page.id as string;
}

async function addBlock(pageId: string, body: Record<string, unknown>) {
  const res = await postBlock({
    request: apiReq("POST", `/pages/${pageId}/blocks?wsId=${env.wsId}`, { cookie: env.cookie, body, test: true }),
    params: { id: pageId },
  });
  return { res, body: await bodyOf(res) };
}

async function batch(pageId: string, ops: unknown[]) {
  const res = await postBatch({
    request: apiReq("POST", `/pages/${pageId}/blocks/batch?wsId=${env.wsId}`, {
      cookie: env.cookie,
      body: { ops },
      test: true,
    }),
    params: { id: pageId },
  });
  return { res, body: await bodyOf(res) };
}

async function readBlocks(pageId: string) {
  const res = await getBlocks({
    request: apiReq("GET", `/pages/${pageId}/blocks?wsId=${env.wsId}`, { cookie: env.cookie }),
    params: { id: pageId },
  });
  return (await bodyOf(res)).blocks as Array<{ id: string; type: string; parentId: string | null }>;
}

describe("a block cannot be moved into its own subtree", () => {
  it("refuses the move that used to create an unbreakable ring", async () => {
    const pageId = await newPage();
    const a = (await addBlock(pageId, { type: "toggle", props: { text: rt("A"), collapsed: false } })).body.block.id;
    const b = (
      await addBlock(pageId, { type: "toggle", props: { text: rt("B"), collapsed: false }, parentId: a })
    ).body.block.id;

    const res = await patchBlock({
      request: apiReq("PATCH", `/blocks/${a}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { parentId: b },
        test: true,
      }),
      params: { id: a },
    });

    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error.message).toBe("A block cannot be moved into its own subtree");
    // The ring must not exist even partially.
    const rows = await readBlocks(pageId);
    expect(rows.find((r) => r.id === a)?.parentId).toBeNull();
    expect(rows.find((r) => r.id === b)?.parentId).toBe(a);
  });

  it("refuses a deeper cycle, not only a direct parent swap", async () => {
    const pageId = await newPage();
    const a = (await addBlock(pageId, { type: "toggle", props: { text: rt("A"), collapsed: false } })).body.block.id;
    const b = (
      await addBlock(pageId, { type: "toggle", props: { text: rt("B"), collapsed: false }, parentId: a })
    ).body.block.id;
    const c = (
      await addBlock(pageId, { type: "toggle", props: { text: rt("C"), collapsed: false }, parentId: b })
    ).body.block.id;

    const res = await patchBlock({
      request: apiReq("PATCH", `/blocks/${a}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { parentId: c },
        test: true,
      }),
      params: { id: a },
    });
    expect(res.status).toBe(409);
  });

  it("still deletes a ring that is already in the table", async () => {
    // Written straight to the table, bypassing the service, to stand in for a
    // row that predates the cycle check. Without a visited set the delete walk
    // never terminated: it grew the queue until `RangeError: Invalid array
    // length` after ~7.5 seconds of one core.
    const pageId = await newPage();
    const a = (await addBlock(pageId, { type: "toggle", props: { text: rt("A"), collapsed: false } })).body.block.id;
    const b = (
      await addBlock(pageId, { type: "toggle", props: { text: rt("B"), collapsed: false }, parentId: a })
    ).body.block.id;
    sqlite.prepare("UPDATE blocks SET parent_id = ? WHERE id = ?").run(b, a);

    const started = Date.now();
    const res = await deleteBlock({
      request: apiReq("DELETE", `/blocks/${a}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: a },
    });
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2000);
    expect((await bodyOf(res)).deleted.sort()).toEqual([a, b].sort());
  });
});

describe("undo of a delete (ux-spec ED-11)", () => {
  it("re-inserting a soft-deleted id revives the block instead of 500ing", async () => {
    const pageId = await newPage();
    const made = await batch(pageId, [
      { op: "insert", id: "undo1", type: "paragraph", props: { text: rt("original") } },
    ]);
    expect(made.res.status).toBe(200);

    expect((await batch(pageId, [{ op: "delete", id: "undo1" }])).res.status).toBe(200);
    expect(await readBlocks(pageId)).toHaveLength(0);

    // The client replays its own insert, which is the only path back: §3.6 has
    // no block restore endpoint. This used to collide on the primary key.
    const undone = await batch(pageId, [
      { op: "insert", id: "undo1", type: "paragraph", props: { text: rt("restored") } },
    ]);
    expect(undone.res.status).toBe(200);
    const rows = await readBlocks(pageId);
    expect(rows.map((r) => r.id)).toEqual(["undo1"]);
    expect((sqlite.prepare("SELECT text FROM blocks WHERE id = 'undo1'").get() as { text: string }).text).toBe(
      "restored",
    );
  });

  it("still refuses an id that names a block on another page", async () => {
    const one = await newPage("one");
    const two = await newPage("two");
    await batch(one, [{ op: "insert", id: "shared", type: "paragraph", props: { text: rt("mine") } }]);
    await batch(one, [{ op: "delete", id: "shared" }]);

    const res = await batch(two, [{ op: "insert", id: "shared", type: "paragraph", props: { text: rt("theirs") } }]);
    expect(res.res.status).toBe(409);
  });
});

describe("turn-into respects the children column from the other side", () => {
  it("refuses turning a parent into a leaf type while it has children", async () => {
    const pageId = await newPage();
    const parent = (await addBlock(pageId, { type: "toggle", props: { text: rt("P"), collapsed: false } })).body.block
      .id;
    await addBlock(pageId, { type: "paragraph", props: { text: rt("child") }, parentId: parent });

    const res = await patchBlock({
      request: apiReq("PATCH", `/blocks/${parent}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { type: "paragraph", props: { text: rt("P") } },
        test: true,
      }),
      params: { id: parent },
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.message).toBe("paragraph blocks do not accept children");
    // The children are still attached to a container, not orphaned under a leaf.
    const rows = await readBlocks(pageId);
    expect(rows.find((r) => r.id === parent)?.type).toBe("toggle");
  });

  it("allows the same turn-into once the children are gone", async () => {
    const pageId = await newPage();
    const parent = (await addBlock(pageId, { type: "toggle", props: { text: rt("P"), collapsed: false } })).body.block
      .id;
    const child = (await addBlock(pageId, { type: "paragraph", props: { text: rt("c") }, parentId: parent })).body
      .block.id;
    await batch(pageId, [{ op: "delete", id: child }]);

    const res = await patchBlock({
      request: apiReq("PATCH", `/blocks/${parent}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { type: "paragraph", props: { text: rt("P") } },
        test: true,
      }),
      params: { id: parent },
    });
    // Without this the guard above could be a blanket refusal of turn-into.
    expect(res.status).toBe(200);
  });
});

describe("the in-batch view tracks type changes", () => {
  it("refuses a child nested under a block an earlier op turned into a leaf", async () => {
    const pageId = await newPage();
    await batch(pageId, [{ op: "insert", id: "tog", type: "toggle", props: { text: rt("T"), collapsed: false } }]);

    // Op 0 replays the insert as a paragraph; op 1 tries to nest under it. The
    // in-memory view used to keep saying "toggle", so the child was allowed and
    // landed under a paragraph inside a transaction the code believed valid.
    const res = await batch(pageId, [
      { op: "insert", id: "tog", type: "paragraph", props: { text: rt("T") } },
      { op: "insert", id: "kid", type: "paragraph", props: { text: rt("k") }, parentId: "tog" },
    ]);
    expect(res.res.status).toBe(400);
    expect(res.body.error.details.join(" ")).toContain("ops[1].parentId");
    expect(await readBlocks(pageId)).toHaveLength(1);
  });
});

describe("reference-bearing props must resolve (§2.6)", () => {
  it("refuses an issue_view whose viewId does not exist", async () => {
    const pageId = await newPage();
    const res = await addBlock(pageId, { type: "issue_view", props: { viewId: "no-such-view" } });
    expect(res.res.status).toBe(400);
    expect(res.body.error.message).toBe("viewId must be a view in this workspace");
  });

  it("refuses a page_link whose pageId does not exist", async () => {
    const pageId = await newPage();
    const res = await addBlock(pageId, { type: "page_link", props: { pageId: "no-such-page", title: "T" } });
    expect(res.res.status).toBe(400);
    expect(res.body.error.message).toBe("pageId must be a live page in this workspace");
  });

  it("accepts a page_link to a real page", async () => {
    const pageId = await newPage();
    const target = await newPage("target");
    const res = await addBlock(pageId, { type: "page_link", props: { pageId: target, title: "T" } });
    expect(res.res.status).toBe(201);
  });
});

describe("payload caps", () => {
  it("caps table cells in both dimensions", async () => {
    const pageId = await newPage();
    // One row of 200,000 cells was accepted, holding the single SQLite writer
    // for 1.6 seconds and stalling every other workspace on the process.
    const wide = { rows: [Array.from({ length: 200 }, () => rt("x"))], headerRow: false };
    expect((await addBlock(pageId, { type: "table", props: wide })).res.status).toBe(400);

    const ok = { rows: [Array.from({ length: 64 }, () => rt("x"))], headerRow: false };
    expect((await addBlock(pageId, { type: "table", props: ok })).res.status).toBe(201);
  });
});

describe("optimistic concurrency (§3, binding)", () => {
  it("409s a block PATCH whose expectedVersion is stale", async () => {
    const pageId = await newPage();
    const id = (await addBlock(pageId, { type: "paragraph", props: { text: rt("v1") } })).body.block.id;

    const stale = await patchBlock({
      request: apiReq("PATCH", `/blocks/${id}?wsId=${env.wsId}&expectedVersion=99`, {
        cookie: env.cookie,
        body: { props: { text: rt("v2") } },
        test: true,
      }),
      params: { id },
    });
    expect(stale.status).toBe(409);
    expect((await bodyOf(stale)).error.code).toBe("CONFLICT");

    const fresh = await patchBlock({
      request: apiReq("PATCH", `/blocks/${id}?wsId=${env.wsId}&expectedVersion=1`, {
        cookie: env.cookie,
        body: { props: { text: rt("v2") } },
        test: true,
      }),
      params: { id },
    });
    // The positive control: without it the 409 could come from any rejection.
    expect(fresh.status).toBe(200);
  });
});
