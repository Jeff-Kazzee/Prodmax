/**
 * Blocks API: the §9 one-query page open, CRUD, batch atomicity, nest rules
 * and sanitization.
 *
 * Each guard here was falsified by breaking what it guards and recording the
 * failure; the messages are in T-007's work log.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as createPage } from "@/pages/api/pages/index";
import { GET as getBlocks, POST as postBlock } from "@/pages/api/pages/[id]/blocks/index";
import { POST as postBatch } from "@/pages/api/pages/[id]/blocks/batch";
import { PATCH as patchBlock, DELETE as deleteBlock } from "@/pages/api/blocks/[id]";
import { BLOCK_TYPES } from "@/lib/validation/blocks";
import { apiReq, bodyOf, createApiDb, teardownApiDb } from "./helpers";
import { docsEnv, explain, recordStatements, rt, touching, type DocsEnv } from "./pages-harness";

let sqlite: Database.Database;
let env: DocsEnv;

beforeEach(async () => {
  sqlite = createApiDb();
  env = await docsEnv();
});
afterEach(teardownApiDb);

async function newPage(title = "Page"): Promise<string> {
  const res = await createPage({
    request: apiReq("POST", `/pages?wsId=${env.wsId}`, { cookie: env.cookie, body: { title }, test: true }),
  });
  expect(res.status).toBe(201);
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

/** A saved view, so issue_view blocks can carry a viewId that resolves. */
async function seedView(): Promise<string> {
  const id = `view-${Math.random().toString(36).slice(2, 10)}`;
  sqlite
    .prepare(
      `INSERT INTO views (id, workspace_id, owner_id, scope, name, layout, filters, order_by, order_dir, display, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, env.wsId, env.userId, "workspace", "V", "list", "{}", "created", "desc", "{}", Date.now(), Date.now());
  return id;
}

async function readBlocks(pageId: string) {
  const res = await getBlocks({
    request: apiReq("GET", `/pages/${pageId}/blocks?wsId=${env.wsId}`, { cookie: env.cookie }),
    params: { id: pageId },
  });
  return { res, body: await bodyOf(res) };
}

describe("page open is one query (architecture §9)", () => {
  it("reads 60 blocks across 3 levels with exactly one statement over blocks", async () => {
    const pageId = await newPage();
    // 20 roots, each a todo with two children: three levels, 60 blocks.
    const ops: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      const root = `r${i}`;
      ops.push({ op: "insert", id: root, type: "todo", props: { text: rt(`root ${i}`), checked: false } });
      ops.push({ op: "insert", id: `${root}c0`, type: "bulleted_list", props: { text: rt("a") }, parentId: root });
      ops.push({ op: "insert", id: `${root}c1`, type: "bulleted_list", props: { text: rt("b") }, parentId: root });
    }
    expect((await batch(pageId, ops)).res.status).toBe(200);

    const { result, sql } = await recordStatements(sqlite, () => readBlocks(pageId));
    expect(result.res.status).toBe(200);
    expect(result.body.blocks).toHaveLength(60);

    const onBlocks = touching("blocks", sql);
    // The load-bearing assertion. An N+1, a per-block props lookup, or a
    // recursive child walk each move this off 1.
    expect(onBlocks).toHaveLength(1);
    // Ordering must be in SQL. A JS sort would still be one query and would
    // still pass the count, while giving up the composite index.
    expect(onBlocks[0]).toMatch(/order by/i);
    expect(onBlocks[0]).not.toMatch(/\bjoin\b/i);
    const plan = explain(sqlite, onBlocks[0]).join(" ");
    expect(plan).toContain("blocks_page_parent_position_idx");
    // The index name alone proves nothing about the ordering: it still serves
    // the page_id lookup when the ORDER BY has moved to a sort buffer. This is
    // the assertion that actually pins the composite index doing the ordering.
    expect(plan).not.toContain("USE TEMP B-TREE FOR ORDER BY");
  });

  it("costs the same number of blocks statements at 3 blocks as at 60", async () => {
    const small = await newPage("small");
    await batch(
      small,
      [0, 1, 2].map((i) => ({ op: "insert", id: `s${i}`, type: "paragraph", props: { text: rt(`p${i}`) } })),
    );
    const a = await recordStatements(sqlite, () => readBlocks(small));

    const big = await newPage("big");
    await batch(
      big,
      Array.from({ length: 60 }, (_, i) => ({
        op: "insert",
        id: `b${i}`,
        type: "paragraph",
        props: { text: rt(`p${i}`) },
      })),
    );
    const b = await recordStatements(sqlite, () => readBlocks(big));

    expect(a.result.body.blocks).toHaveLength(3);
    expect(b.result.body.blocks).toHaveLength(60);
    // No magic constant: the two runs are compared to each other, so a guard
    // that grows moves both and only a per-row query moves one.
    expect(touching("blocks", b.sql)).toHaveLength(touching("blocks", a.sql).length);
  });
});

describe("nest rules (§2.6 children-allowed column)", () => {
  /**
   * Transcribed by hand from architecture §2.6's "children allowed" column.
   * Deriving it from BLOCK_SPECS would make the test agree with the code by
   * construction instead of with the spec, and would leave an inverted flag
   * invisible. All 19 rows are here: covering only some of them let
   * `heading_2` flip to child-bearing with every suite still green.
   */
  const CHILDREN_ALLOWED: Record<string, boolean> = {
    paragraph: false,
    heading_1: false,
    heading_2: false,
    heading_3: false,
    bulleted_list: true,
    numbered_list: true,
    todo: true,
    toggle: true,
    quote: false,
    callout: false,
    divider: false,
    code: false,
    image: false,
    file: false,
    bookmark: false,
    embed: false,
    table: false,
    issue_view: false,
    page_link: false,
  };

  function propsFor(type: string, refs: { viewId: string; pageId: string }): unknown {
    switch (type) {
      case "todo":
        return { text: rt("t"), checked: false };
      case "toggle":
        return { text: rt("t"), collapsed: false };
      case "callout":
        return { text: rt("t"), emoji: "💡" };
      case "divider":
        return {};
      case "code":
        return { code: "x", language: "ts", wrap: false };
      case "image":
        return { url: "https://example.test/a.png" };
      case "file":
        return { url: "https://example.test/a.pdf", name: "a.pdf" };
      case "bookmark":
        return { url: "https://example.test", title: "T", description: "D", icon: "https://example.test/i.png" };
      case "embed":
        return { url: "https://example.test/e", provider: "test" };
      case "table":
        return { rows: [[rt("a")]], headerRow: true };
      case "issue_view":
        return { viewId: refs.viewId };
      case "page_link":
        return { pageId: refs.pageId, title: "T" };
      default:
        return { text: rt("t") };
    }
  }

  it("covers every block type the schema allows", () => {
    expect(Object.keys(CHILDREN_ALLOWED).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it.each(BLOCK_TYPES)("%s honours its children-allowed column", async (type) => {
    const pageId = await newPage();
    const refs = { viewId: await seedView(), pageId: await newPage("link target") };
    const parent = await addBlock(pageId, { type, props: propsFor(type, refs) });
    expect(parent.res.status, `creating a ${type} block: ${JSON.stringify(parent.body)}`).toBe(201);

    const child = await addBlock(pageId, {
      type: "paragraph",
      props: { text: rt("child") },
      parentId: parent.body.block.id,
    });

    if (CHILDREN_ALLOWED[type]) {
      expect(child.res.status, `${type} should accept children`).toBe(201);
    } else {
      expect(child.res.status, `${type} should refuse children`).toBe(400);
      expect(child.body.error.message).toBe(`${type} blocks do not accept children`);
    }
  });
});

describe("batch is one transaction", () => {
  it("applies nothing when a later op fails validation", async () => {
    const pageId = await newPage();
    await addBlock(pageId, { type: "paragraph", props: { text: rt("existing") } });
    const before = (await readBlocks(pageId)).body.blocks.length;

    const { res, body } = await batch(pageId, [
      { op: "insert", id: "ok1", type: "paragraph", props: { text: rt("one") } },
      { op: "insert", id: "ok2", type: "paragraph", props: { text: rt("two") } },
      { op: "insert", id: "bad", type: "paragraph", props: { text: rt("three") }, parentId: "ok1" },
    ]);

    expect(res.status).toBe(400);
    expect(body.error.details[0]).toContain("ops[2].parentId");
    // The two valid inserts ran before the failure and must have been rolled back.
    expect((await readBlocks(pageId)).body.blocks).toHaveLength(before);
  });

  it("lets a later op nest under a block an earlier op inserted", async () => {
    const pageId = await newPage();
    const { res } = await batch(pageId, [
      { op: "insert", id: "tog", type: "toggle", props: { text: rt("parent"), collapsed: false } },
      { op: "insert", id: "kid", type: "paragraph", props: { text: rt("child") }, parentId: "tog" },
    ]);
    expect(res.status).toBe(200);
    const blocks = (await readBlocks(pageId)).body.blocks as Array<{ id: string; parentId: string | null }>;
    expect(blocks.find((b) => b.id === "kid")?.parentId).toBe("tog");
  });

  it("converges when the identical batch is replayed", async () => {
    const pageId = await newPage();
    const ops = [
      { op: "insert", id: "x1", type: "paragraph", props: { text: rt("hello") } },
      { op: "insert", id: "x2", type: "paragraph", props: { text: rt("world") } },
    ];
    expect((await batch(pageId, ops)).res.status).toBe(200);
    const first = (await readBlocks(pageId)).body.blocks.length;

    // ux-spec ED-12 flushes the same body again after a reconnect. A 409 here
    // would be data loss, and duplicating the blocks would be worse.
    expect((await batch(pageId, ops)).res.status).toBe(200);
    expect((await readBlocks(pageId)).body.blocks).toHaveLength(first);
  });

  it("accepts a batch at the op cap and rejects one over it", async () => {
    const opsOf = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        op: "insert",
        id: `c${i}`,
        type: "paragraph",
        props: { text: rt("x") },
      }));
    // Both sides of the boundary. Testing only the over-cap case let the
    // comparison flip to >= and start rejecting legal 500-op batches unseen.
    expect((await batch(await newPage("at cap"), opsOf(500))).res.status).toBe(200);
    expect((await batch(await newPage("over cap"), opsOf(501))).res.status).toBe(413);
  });
});

describe("block CRUD", () => {
  it("soft-deletes a block together with its children", async () => {
    const pageId = await newPage();
    const parent = await addBlock(pageId, { type: "toggle", props: { text: rt("p"), collapsed: false } });
    const child = await addBlock(pageId, {
      type: "paragraph",
      props: { text: rt("c") },
      parentId: parent.body.block.id,
    });
    const res = await deleteBlock({
      request: apiReq("DELETE", `/blocks/${parent.body.block.id}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        test: true,
      }),
      params: { id: parent.body.block.id },
    });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).deleted).toEqual(
      expect.arrayContaining([parent.body.block.id, child.body.block.id]),
    );
    expect((await readBlocks(pageId)).body.blocks).toHaveLength(0);
  });

  it("turn-into rewrites type and props together", async () => {
    const pageId = await newPage();
    const made = await addBlock(pageId, { type: "paragraph", props: { text: rt("becomes a heading") } });
    const res = await patchBlock({
      request: apiReq("PATCH", `/blocks/${made.body.block.id}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { type: "heading_2", props: { text: rt("becomes a heading") } },
        test: true,
      }),
      params: { id: made.body.block.id },
    });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).block.type).toBe("heading_2");
  });

  it("refuses a type change that does not carry props", async () => {
    const pageId = await newPage();
    const made = await addBlock(pageId, { type: "paragraph", props: { text: rt("x") } });
    const res = await patchBlock({
      request: apiReq("PATCH", `/blocks/${made.body.block.id}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { type: "code" },
        test: true,
      }),
      params: { id: made.body.block.id },
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.details).toContain("props: props is required when type changes");
  });
});
