/**
 * Page and template regressions found by the T-007 multi-model review.
 *
 * Every one of these was reproduced against a tree whose four gates were
 * green, so they are kept apart from the suites that missed them.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as listPages, POST as createPage } from "@/pages/api/pages/index";
import { GET as getTree } from "@/pages/api/pages/tree";
import { PATCH as patchPage, DELETE as deletePage } from "@/pages/api/pages/[id]/index";
import { POST as restore } from "@/pages/api/pages/[id]/restore";
import { GET as listTemplates, POST as createTemplate } from "@/pages/api/templates/index";
import { PATCH as patchTemplate } from "@/pages/api/templates/[id]/index";
import { apiReq, bodyOf, createApiDb, teardownApiDb } from "./helpers";
import { docsEnv, recordStatements, rt, touching, type DocsEnv } from "./pages-harness";

let sqlite: Database.Database;
let env: DocsEnv;

beforeEach(async () => {
  sqlite = createApiDb();
  env = await docsEnv();
});
afterEach(teardownApiDb);

async function newPage(title: string, parentId?: string): Promise<string> {
  const res = await createPage({
    request: apiReq("POST", `/pages?wsId=${env.wsId}`, {
      cookie: env.cookie,
      body: { title, ...(parentId ? { parentId } : {}) },
      test: true,
    }),
  });
  expect(res.status).toBe(201);
  return (await bodyOf(res)).page.id as string;
}

async function patch(id: string, body: Record<string, unknown>, query = "") {
  const res = await patchPage({
    request: apiReq("PATCH", `/pages/${id}?wsId=${env.wsId}${query}`, { cookie: env.cookie, body, test: true }),
    params: { id },
  });
  return { res, body: await bodyOf(res) };
}

function rowOf(id: string) {
  return sqlite.prepare("SELECT title, version, parent_id, deleted_at FROM pages WHERE id = ?").get(id) as {
    title: string;
    version: number;
    parent_id: string | null;
    deleted_at: number | null;
  };
}

describe("a PATCH is all or nothing", () => {
  it("does not commit the rename when the move leg is rejected", async () => {
    const parent = await newPage("Parent");
    const child = await newPage("Child", parent);

    // Renaming and moving in one request, where the move is a cycle.
    const { res } = await patch(parent, { title: "RENAMED", parentId: child });
    expect(res.status).toBe(409);

    // The metadata UPDATE used to run outside any transaction, so this
    // committed while the request returned an error.
    expect(rowOf(parent).title).toBe("Parent");
    expect(rowOf(parent).version).toBe(1);
  });

  it("does not commit the rename when the move breaches the depth cap", async () => {
    let previous = await newPage("d0");
    const chain = [previous];
    for (let d = 1; d <= 19; d++) {
      previous = await newPage(`d${d}`, previous);
      chain.push(previous);
    }
    const root = await newPage("movable");
    await newPage("movable child", root);

    const { res } = await patch(root, { title: "RENAMED", parentId: chain[19] });
    expect(res.status).toBe(400);
    expect(rowOf(root).title).toBe("movable");
  });
});

describe("one request bumps version once", () => {
  it("renames and moves with a single bump", async () => {
    const a = await newPage("A");
    const target = await newPage("T");
    expect(rowOf(a).version).toBe(1);

    const { res } = await patch(a, { title: "Renamed", parentId: target });
    expect(res.status).toBe(200);
    expect(rowOf(a).title).toBe("Renamed");
    expect(rowOf(a).parent_id).toBe(target);
    // Two separate UPDATEs bumped this to 3, so a client that renamed and
    // moved in one PATCH got a version two ahead of its optimistic state.
    expect(rowOf(a).version).toBe(2);
  });
});

describe("optimistic concurrency on pages (§3, binding)", () => {
  it("409s a stale expectedVersion and accepts a fresh one", async () => {
    const a = await newPage("A");
    const stale = await patch(a, { title: "x" }, "&expectedVersion=99");
    expect(stale.res.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");
    expect(rowOf(a).title).toBe("A");

    const fresh = await patch(a, { title: "x" }, "&expectedVersion=1");
    expect(fresh.res.status).toBe(200);
    expect(rowOf(a).title).toBe("x");
  });
});

describe("the trash window has one boundary, not two", () => {
  const WINDOW = 30 * 24 * 60 * 60 * 1000;

  /**
   * Trash a page, then backdate its stamp so the boundary is reached at the
   * real current time. Freezing the clock 30 days forward is not an option
   * here: it also expires the session and the request 401s before it reaches
   * the code under test.
   */
  async function trashedAt(ageMs: number): Promise<string> {
    const id = await newPage(`aged-${ageMs}`);
    await deletePage({
      request: apiReq("DELETE", `/pages/${id}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id },
    });
    sqlite.prepare("UPDATE pages SET deleted_at = ? WHERE id = ?").run(Date.now() - ageMs, id);
    return id;
  }

  async function listedInTrash(id: string): Promise<boolean> {
    const res = await listPages({
      request: apiReq("GET", `/pages?wsId=${env.wsId}&trashed=true`, { cookie: env.cookie }),
    });
    return (await bodyOf(res)).data.some((p: { id: string }) => p.id === id);
  }

  async function restorable(id: string): Promise<boolean> {
    const res = await restore({
      request: apiReq("POST", `/pages/${id}/restore?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id },
    });
    return res.status === 200;
  }

  it("lists exactly what it will restore, on both sides of the boundary", async () => {
    // The two call sites spelled the comparison differently and disagreed by
    // one millisecond, so a page could be absent from the trash listing and
    // still restorable. Assert they agree rather than asserting either value.
    const expired = await trashedAt(WINDOW + 1000);
    expect(await listedInTrash(expired)).toBe(false);
    expect(await restorable(expired)).toBe(false);

    const alive = await trashedAt(WINDOW - 60_000);
    expect(await listedInTrash(alive)).toBe(true);
    expect(await restorable(alive)).toBe(true);
  });
});

describe("list endpoints paginate (§3, binding)", () => {
  it("honours limit and cursor on GET /api/pages", async () => {
    for (let i = 0; i < 6; i++) await newPage(`p${i}`);
    const first = await listPages({
      request: apiReq("GET", `/pages?wsId=${env.wsId}&limit=2`, { cookie: env.cookie }),
    });
    const firstBody = await bodyOf(first);
    expect(firstBody.data).toHaveLength(2);
    expect(firstBody.nextCursor).not.toBeNull();

    const second = await listPages({
      request: apiReq("GET", `/pages?wsId=${env.wsId}&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`, {
        cookie: env.cookie,
      }),
    });
    const secondBody = await bodyOf(second);
    expect(secondBody.data).toHaveLength(2);
    const firstIds = firstBody.data.map((p: { id: string }) => p.id);
    expect(secondBody.data.map((p: { id: string }) => p.id).filter((id: string) => firstIds.includes(id))).toEqual([]);
  });

  it("honours limit on GET /api/templates", async () => {
    for (let i = 0; i < 4; i++) {
      await createTemplate({
        request: apiReq("POST", `/templates?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: { kind: "issue", name: `T${i}`, data: {} },
          test: true,
        }),
      });
    }
    const res = await listTemplates({
      request: apiReq("GET", `/templates?wsId=${env.wsId}&limit=2`, { cookie: env.cookie }),
    });
    const body = await bodyOf(res);
    expect(body.data).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();
  });
});

describe("the sidebar tree costs O(visible), not O(workspace)", () => {
  it("constrains every page query to the nodes it will return", async () => {
    const root = await newPage("root");
    for (let i = 0; i < 3; i++) await newPage(`hidden${i}`, root);
    const other = await newPage("other");
    for (let i = 0; i < 20; i++) await newPage(`deep${i}`, other);

    const { result, sql } = await recordStatements(sqlite, () =>
      getTree({ request: apiReq("GET", `/pages/tree?wsId=${env.wsId}`, { cookie: env.cookie }) }),
    );
    expect((await bodyOf(result)).data).toHaveLength(2);

    // Statement COUNT cannot catch this: the unscoped version also issued two.
    // What distinguishes them is the shape. The hasChildren query used to ask
    // the whole workspace which parents have children, which is O(all live
    // pages) behind an O(visible) response. Every page statement here must
    // constrain parent_id.
    const onPages = touching("pages", sql).filter((s) => /^\s*select/i.test(s));
    expect(onPages.length).toBeGreaterThan(0);
    for (const statement of onPages) {
      // The WHERE clause specifically. `SELECT DISTINCT parent_id ...` carries
      // the column name in its projection, so matching the whole statement
      // passed even against the unscoped query this test exists to catch.
      const where = statement.split(/\bwhere\b/i)[1] ?? "";
      expect(where, `page query not scoped by parent: ${statement}`).toMatch(/parent_id/i);
    }
  });
});

describe("templates round-trip everything §2.7 gives them", () => {
  it("stores and returns recurrence", async () => {
    const made = await createTemplate({
      request: apiReq("POST", `/templates?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: {
          kind: "issue",
          name: "Weekly bug sweep",
          data: { title: "Sweep" },
          recurrence: { freq: "weekly", every: 1 },
        },
        test: true,
      }),
    });
    expect(made.status).toBe(201);
    const id = (await bodyOf(made)).template.id as string;

    const listed = await listTemplates({ request: apiReq("GET", `/templates?wsId=${env.wsId}`, { cookie: env.cookie }) });
    expect((await bodyOf(listed)).data[0].recurrence).toEqual({ freq: "weekly", every: 1 });

    const cleared = await patchTemplate({
      request: apiReq("PATCH", `/templates/${id}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { recurrence: null },
        test: true,
      }),
      params: { id },
    });
    expect((await bodyOf(cleared)).template.recurrence).toBeNull();
  });

  it("answers 400, not 500, for a template nested past the depth cap", async () => {
    // A plain Error from the depth check reached route()'s catch-all and
    // became INTERNAL, which §3 forbids: VALIDATION is 400 on every route.
    let node: Record<string, unknown> = { type: "paragraph", props: { text: rt("deep") } };
    for (let i = 0; i < 15; i++) {
      node = { type: "toggle", props: { text: rt(`l${i}`), collapsed: false }, children: [node] };
    }
    const res = await createTemplate({
      request: apiReq("POST", `/templates?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { kind: "page", name: "Deep", data: { blocks: [node] } },
        test: true,
      }),
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.code).toBe("VALIDATION");
  });

  it("refuses a teamId from another workspace", async () => {
    const other = await docsEnv();
    const res = await createTemplate({
      request: apiReq("POST", `/templates?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { kind: "issue", name: "T", data: {}, teamId: other.teamId },
        test: true,
      }),
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.message).toBe("teamId must be a team in this workspace");
  });
});
