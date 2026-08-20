/**
 * Templates API (§2.7, §3.6): CRUD and instantiate.
 *
 * Filed under `pages-templates` to sit inside T-007's owns glob
 * (tests/api/{pages,blocks,search}*), matching the service and schema naming.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as listTemplates, POST as createTemplate } from "@/pages/api/templates/index";
import { PATCH as patchTemplate, DELETE as deleteTemplate } from "@/pages/api/templates/[id]/index";
import { POST as instantiate } from "@/pages/api/templates/[id]/instantiate";
import { GET as getBlocks } from "@/pages/api/pages/[id]/blocks/index";
import { apiReq, bodyOf, createApiDb, teardownApiDb } from "./helpers";
import { docsEnv, rt, type DocsEnv } from "./pages-harness";

let sqlite: Database.Database;
let env: DocsEnv;

beforeEach(async () => {
  sqlite = createApiDb();
  env = await docsEnv();
});
afterEach(teardownApiDb);

async function mkTemplate(body: Record<string, unknown>) {
  const res = await createTemplate({
    request: apiReq("POST", `/templates?wsId=${env.wsId}`, { cookie: env.cookie, body, test: true }),
  });
  return { res, body: await bodyOf(res) };
}

async function run(id: string, body: Record<string, unknown> = {}) {
  const res = await instantiate({
    request: apiReq("POST", `/templates/${id}/instantiate?wsId=${env.wsId}`, { cookie: env.cookie, body, test: true }),
    params: { id },
  });
  return { res, body: await bodyOf(res) };
}

const NESTED_PAGE_TEMPLATE = {
  kind: "page",
  name: "Weekly review",
  data: {
    icon: "📘",
    blocks: [
      { type: "heading_1", props: { text: rt("Weekly review") } },
      {
        type: "toggle",
        props: { text: rt("Wins"), collapsed: false },
        children: [
          { type: "bulleted_list", props: { text: rt("First win") } },
          { type: "bulleted_list", props: { text: rt("Second win") } },
        ],
      },
      { type: "todo", props: { text: rt("Send the summary"), checked: false } },
    ],
  },
};

describe("template CRUD", () => {
  it("creates, lists by kind, patches and deletes", async () => {
    const page = await mkTemplate(NESTED_PAGE_TEMPLATE);
    expect(page.res.status).toBe(201);
    const issue = await mkTemplate({ kind: "issue", name: "Bug report", data: { title: "Bug: " } });
    expect(issue.res.status).toBe(201);

    const listed = await listTemplates({
      request: apiReq("GET", `/templates?wsId=${env.wsId}&kind=page`, { cookie: env.cookie }),
    });
    expect((await bodyOf(listed)).data.map((t: { id: string }) => t.id)).toEqual([page.body.template.id]);

    const patched = await patchTemplate({
      request: apiReq("PATCH", `/templates/${page.body.template.id}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { name: "Renamed" },
        test: true,
      }),
      params: { id: page.body.template.id },
    });
    expect((await bodyOf(patched)).template.name).toBe("Renamed");

    const deleted = await deleteTemplate({
      request: apiReq("DELETE", `/templates/${page.body.template.id}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        test: true,
      }),
      params: { id: page.body.template.id },
    });
    expect(deleted.status).toBe(200);
    const after = await listTemplates({ request: apiReq("GET", `/templates?wsId=${env.wsId}`, { cookie: env.cookie }) });
    expect((await bodyOf(after)).data).toHaveLength(1);
  });

  it("rejects data that does not match its kind", async () => {
    const bad = await mkTemplate({ kind: "page", name: "Broken", data: { blocks: "not an array" } });
    expect(bad.res.status).toBe(400);
    expect(bad.body.error.details.join(" ")).toContain("data.blocks");
  });
});

describe("instantiate", () => {
  it("clones a page template's block tree, nesting included", async () => {
    const made = await mkTemplate(NESTED_PAGE_TEMPLATE);
    const { res, body } = await run(made.body.template.id, { title: "Review, week 12" });

    expect(res.status).toBe(201);
    expect(body.kind).toBe("page");
    expect(body.page.title).toBe("Review, week 12");
    expect(body.page.icon).toBe("📘");

    const blocks = (await bodyOf(
      await getBlocks({
        request: apiReq("GET", `/pages/${body.page.id}/blocks?wsId=${env.wsId}`, { cookie: env.cookie }),
        params: { id: body.page.id },
      }),
    )).blocks as Array<{ id: string; type: string; parentId: string | null; text: string }>;

    expect(blocks).toHaveLength(5);
    const toggle = blocks.find((b) => b.type === "toggle")!;
    const children = blocks.filter((b) => b.parentId === toggle.id);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.text).sort()).toEqual(["First win", "Second win"]);
    // Ids are fresh, not the template's.
    expect(new Set(blocks.map((b) => b.id)).size).toBe(5);
  });

  it("returns a prefilled payload for an issue template and creates no issue", async () => {
    const made = await mkTemplate({
      kind: "issue",
      name: "Bug report",
      data: { title: "Bug: ", priority: 2, labels: ["bug"] },
    });
    const before = (sqlite.prepare("SELECT count(*) n FROM issues").get() as { n: number }).n;

    const { res, body } = await run(made.body.template.id);
    expect(res.status).toBe(200);
    expect(body.kind).toBe("issue");
    expect(body.payload).toMatchObject({ title: "Bug: ", priority: 2, labels: ["bug"] });

    // The point of the design: instantiate does not reach the issues table,
    // so it cannot bypass the issue-write choke point (§9).
    expect((sqlite.prepare("SELECT count(*) n FROM issues").get() as { n: number }).n).toBe(before);
  });

  it("counts usage", async () => {
    const made = await mkTemplate({ kind: "issue", name: "T", data: {} });
    await run(made.body.template.id);
    await run(made.body.template.id);
    const listed = await listTemplates({ request: apiReq("GET", `/templates?wsId=${env.wsId}`, { cookie: env.cookie }) });
    expect((await bodyOf(listed)).data[0].usageCount).toBe(2);
  });

  it("refuses a template from another workspace", async () => {
    const made = await mkTemplate({ kind: "issue", name: "T", data: {} });
    const other = await docsEnv();
    const res = await instantiate({
      request: apiReq("POST", `/templates/${made.body.template.id}/instantiate?wsId=${other.wsId}`, {
        cookie: other.cookie,
        body: {},
        test: true,
      }),
      params: { id: made.body.template.id },
    });
    expect(res.status).toBe(404);
  });
});
