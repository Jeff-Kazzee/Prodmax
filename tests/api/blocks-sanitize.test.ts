/**
 * Sanitization is a property of every write path, not of one endpoint
 * (architecture §2.6).
 *
 * One hostile payload is driven through all five paths that can put props in
 * the blocks table, and every one is asserted to produce the identical stored
 * result. Testing a single path and assuming the rest is exactly how a sixth
 * path later ships unsanitized.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as createPage } from "@/pages/api/pages/index";
import { POST as postBlock } from "@/pages/api/pages/[id]/blocks/index";
import { POST as postBatch } from "@/pages/api/pages/[id]/blocks/batch";
import { PATCH as patchBlock } from "@/pages/api/blocks/[id]";
import { POST as createTemplate } from "@/pages/api/templates/index";
import { POST as instantiate } from "@/pages/api/templates/[id]/instantiate";
import { apiReq, bodyOf, createApiDb, teardownApiDb } from "./helpers";
import { docsEnv, rt, type DocsEnv } from "./pages-harness";

let sqlite: Database.Database;
let env: DocsEnv;

beforeEach(async () => {
  sqlite = createApiDb();
  env = await docsEnv();
});
afterEach(teardownApiDb);

/**
 * Four separate sanitize cases in one payload: an unknown mark, a
 * javascript: link, a mention of somebody outside the workspace, and a
 * mention that genuinely resolves. The last one is what stops the expected
 * output from being satisfiable by a sanitizer that simply drops everything.
 */
function hostile() {
  return {
    text: [
      { type: "text", text: "hi", marks: { bold: true, underline: true, link: "javascript:alert(1)" } },
      { type: "text", text: "ok", marks: { link: "https://ok.test" } },
      { type: "mention", target: "user", id: "not-a-member", label: "Ghost" },
      { type: "mention", target: "user", id: env.userId, label: "Real" },
    ],
  };
}

function expectedProps() {
  return {
    text: [
      { type: "text", text: "hi", marks: { bold: true } },
      { type: "text", text: "ok", marks: { link: "https://ok.test" } },
      { type: "text", text: "Ghost" },
      { type: "mention", target: "user", id: env.userId, label: "Real" },
    ],
  };
}

const EXPECTED_TEXT = "hi ok Ghost Real";

async function newPage(): Promise<string> {
  const res = await createPage({
    request: apiReq("POST", `/pages?wsId=${env.wsId}`, { cookie: env.cookie, body: { title: "P" }, test: true }),
  });
  return (await bodyOf(res)).page.id as string;
}

function storedRow(id: string) {
  return sqlite.prepare("SELECT props, text FROM blocks WHERE id = ?").get(id) as { props: string; text: string };
}

/* Each entry returns the id of a block whose stored row must match. */
const PATHS: Array<[string, () => Promise<string>]> = [
  [
    "POST /api/pages/:id/blocks",
    async () => {
      const pageId = await newPage();
      const res = await postBlock({
        request: apiReq("POST", `/pages/${pageId}/blocks?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: { type: "paragraph", props: hostile() },
          test: true,
        }),
        params: { id: pageId },
      });
      expect(res.status).toBe(201);
      return (await bodyOf(res)).block.id as string;
    },
  ],
  [
    "PATCH /api/blocks/:id",
    async () => {
      const pageId = await newPage();
      const made = await postBlock({
        request: apiReq("POST", `/pages/${pageId}/blocks?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: { type: "paragraph", props: { text: rt("clean") } },
          test: true,
        }),
        params: { id: pageId },
      });
      const id = (await bodyOf(made)).block.id as string;
      const res = await patchBlock({
        request: apiReq("PATCH", `/blocks/${id}?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: { props: hostile() },
          test: true,
        }),
        params: { id },
      });
      expect(res.status).toBe(200);
      return id;
    },
  ],
  [
    "POST /api/pages/:id/blocks/batch (insert)",
    async () => {
      const pageId = await newPage();
      const res = await postBatch({
        request: apiReq("POST", `/pages/${pageId}/blocks/batch?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: { ops: [{ op: "insert", id: "bi1", type: "paragraph", props: hostile() }] },
          test: true,
        }),
        params: { id: pageId },
      });
      expect(res.status).toBe(200);
      return "bi1";
    },
  ],
  [
    "POST /api/pages/:id/blocks/batch (update)",
    async () => {
      const pageId = await newPage();
      await postBatch({
        request: apiReq("POST", `/pages/${pageId}/blocks/batch?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: { ops: [{ op: "insert", id: "bu1", type: "paragraph", props: { text: rt("clean") } }] },
          test: true,
        }),
        params: { id: pageId },
      });
      const res = await postBatch({
        request: apiReq("POST", `/pages/${pageId}/blocks/batch?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: { ops: [{ op: "update", id: "bu1", props: hostile() }] },
          test: true,
        }),
        params: { id: pageId },
      });
      expect(res.status).toBe(200);
      return "bu1";
    },
  ],
  [
    "POST /api/templates/:id/instantiate (page clone)",
    async () => {
      const made = await createTemplate({
        request: apiReq("POST", `/templates?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: {
            kind: "page",
            name: "Hostile template",
            data: { blocks: [{ type: "paragraph", props: hostile() }] },
          },
          test: true,
        }),
      });
      expect(made.status).toBe(201);
      const templateId = (await bodyOf(made)).template.id as string;
      const res = await instantiate({
        request: apiReq("POST", `/templates/${templateId}/instantiate?wsId=${env.wsId}`, {
          cookie: env.cookie,
          body: {},
          test: true,
        }),
        params: { id: templateId },
      });
      expect(res.status).toBe(201);
      return (await bodyOf(res)).blocks[0].id as string;
    },
  ],
];

describe("every write path sanitizes identically (§2.6)", () => {
  it.each(PATHS)("%s", async (_label, run) => {
    const id = await run();
    const row = storedRow(id);
    expect(JSON.parse(row.props)).toEqual(expectedProps());
    // The text column is derived from the sanitized props by the same
    // function, so the FTS body cannot disagree with the document.
    expect(row.text).toBe(EXPECTED_TEXT);
  });
});

describe("structural problems are rejected rather than sanitized", () => {
  it("refuses an unknown block type", async () => {
    const pageId = await newPage();
    const res = await postBlock({
      request: apiReq("POST", `/pages/${pageId}/blocks?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { type: "spreadsheet", props: {} },
        test: true,
      }),
      params: { id: pageId },
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.details).toContain("block.type: spreadsheet");
  });

  it("refuses props that do not match the type's contract", async () => {
    const pageId = await newPage();
    const res = await postBlock({
      request: apiReq("POST", `/pages/${pageId}/blocks?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { type: "code", props: { code: "x" } },
        test: true,
      }),
      params: { id: pageId },
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.details.join(" ")).toContain("block.props.language");
  });

  it("refuses a javascript: url in a props field, where there is no text to preserve", async () => {
    const pageId = await newPage();
    const res = await postBlock({
      request: apiReq("POST", `/pages/${pageId}/blocks?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { type: "image", props: { url: "javascript:alert(1)" } },
        test: true,
      }),
      params: { id: pageId },
    });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.details.join(" ")).toContain("url must be http, https or a root-relative path");
  });
});
