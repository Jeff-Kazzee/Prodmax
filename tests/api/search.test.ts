/**
 * Unified search (§2.10, §3.6, FM-042): ranking, the §7 permission filter,
 * and the soft-delete exclusion.
 *
 * Corpus size is part of the fixture, not an accident. The bm25 title weight
 * (10:1) produces a score gap that is measurable only once the corpus is big
 * enough for the term to be non-uniform. Measured against this engine:
 *
 *     fillers   title-vs-body score gap
 *     0         0.000001          <- float noise
 *     3         0.000001
 *     6         0.155659
 *     20        1.207501
 *     100       2.643132
 *
 * So a ranking assertion over a three-document corpus passes on rounding
 * noise and would pass just as well against a 1:1 weighting. These tests seed
 * 20 filler pages and assert ordering, which is what actually moves.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as search } from "@/pages/api/search/index";
import { POST as createPage } from "@/pages/api/pages/index";
import { PATCH as patchPage, DELETE as deletePage } from "@/pages/api/pages/[id]/index";
import { POST as postBlock } from "@/pages/api/pages/[id]/blocks/index";
import { POST as createIssue } from "@/pages/api/issues/index";
import { POST as createTeam } from "@/pages/api/teams/index";
import { apiReq, bodyOf, createApiDb, teardownApiDb } from "./helpers";
import { addActor, docsEnv, rt, type DocsEnv } from "./pages-harness";

let sqlite: Database.Database;
let env: DocsEnv;

beforeEach(async () => {
  sqlite = createApiDb();
  env = await docsEnv();
});
afterEach(teardownApiDb);

async function mkPage(title: string): Promise<string> {
  const res = await createPage({
    request: apiReq("POST", `/pages?wsId=${env.wsId}`, { cookie: env.cookie, body: { title }, test: true }),
  });
  return (await bodyOf(res)).page.id as string;
}

async function addParagraph(pageId: string, text: string) {
  await postBlock({
    request: apiReq("POST", `/pages/${pageId}/blocks?wsId=${env.wsId}`, {
      cookie: env.cookie,
      body: { type: "paragraph", props: { text: rt(text) } },
      test: true,
    }),
    params: { id: pageId },
  });
}

/** 20 filler pages, so the bm25 column weight clears floating-point noise. */
async function seedFillers(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const id = await mkPage(`filler${i} noise`);
    await addParagraph(id, "lorem ipsum dolor sit amet");
  }
}

async function query(q: string, extra = "", cookie = env.cookie) {
  const res = await search({
    request: apiReq("GET", `/search?wsId=${env.wsId}&q=${encodeURIComponent(q)}${extra}`, { cookie }),
  });
  return { res, body: await bodyOf(res) };
}

describe("ranking", () => {
  it("puts a title match above a body-only match", async () => {
    await seedFillers();
    const inTitle = await mkPage("gamma delta");
    await addParagraph(inTitle, "epsilon zeta");
    const inBody = await mkPage("epsilon zeta");
    await addParagraph(inBody, "gamma delta");

    const { res, body } = await query("gamma");
    expect(res.status).toBe(200);
    const ids = body.data.map((h: { entityId: string }) => h.entityId);
    expect(ids).toHaveLength(2);
    // Ordering, not a score inequality. The scores differ by ~1.2 here, but a
    // bare `score[0] > score[1]` would also hold at a 1e-6 gap produced by
    // rounding, which is what makes that shape of assertion untrustworthy.
    expect(ids[0]).toBe(inTitle);
    expect(ids[1]).toBe(inBody);
    expect(body.data[0].score).toBeGreaterThan(body.data[1].score + 0.5);
  });

  it("finds a page by the text of one of its blocks", async () => {
    const page = await mkPage("Runbook");
    await addParagraph(page, "escalation path for checkout outages");
    const { body } = await query("escalation");
    expect(body.data.map((h: { entityId: string }) => h.entityId)).toEqual([page]);
  });

  it("reflects an edited block, so the index tracks the document", async () => {
    const page = await mkPage("Runbook");
    await addParagraph(page, "aardvark procedures");
    expect((await query("aardvark")).body.data).toHaveLength(1);

    const blockId = (sqlite.prepare("SELECT id FROM blocks WHERE page_id = ?").get(page) as { id: string }).id;
    const { PATCH } = await import("@/pages/api/blocks/[id]");
    await PATCH({
      request: apiReq("PATCH", `/blocks/${blockId}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { props: { text: rt("buffalo procedures") } },
        test: true,
      }),
      params: { id: blockId },
    });
    expect((await query("aardvark")).body.data).toHaveLength(0);
    expect((await query("buffalo")).body.data.map((h: { entityId: string }) => h.entityId)).toEqual([page]);
  });
});

describe("liveness", () => {
  /**
   * The FTS triggers in src/db/fts.sql re-insert a page row on a `deleted_at`
   * update, so the index keeps trashed pages. That file is outside T-007's
   * owns list; the containment is the visibility pass in the search service,
   * and T-035 carries the trigger fix.
   */
  it("hides a trashed page even though the index still holds it", async () => {
    const page = await mkPage("Runbook for payment incidents");
    await addParagraph(page, "escalation path");
    expect((await query("payment")).body.data).toHaveLength(1);

    await deletePage({
      request: apiReq("DELETE", `/pages/${page}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: page },
    });
    expect((await query("payment")).body.data).toHaveLength(0);

    // The tripwire for T-035: this asserts the known trigger behaviour as a
    // fact. When the triggers are fixed, this line fails and should be
    // deleted; the visibility pass above stays.
    const stillIndexed = (
      sqlite
        .prepare("SELECT count(*) n FROM search_fts WHERE entity_type = 'page' AND entity_id = ?")
        .get(page) as { n: number }
    ).n;
    expect(stillIndexed).toBe(1);
  });

  it("returns a restored page again", async () => {
    const page = await mkPage("Runbook for payment incidents");
    await deletePage({
      request: apiReq("DELETE", `/pages/${page}?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: page },
    });
    const { POST: restore } = await import("@/pages/api/pages/[id]/restore");
    await restore({
      request: apiReq("POST", `/pages/${page}/restore?wsId=${env.wsId}`, { cookie: env.cookie, test: true }),
      params: { id: page },
    });
    expect((await query("payment")).body.data.map((h: { entityId: string }) => h.entityId)).toEqual([page]);
  });

  it("tracks a renamed page", async () => {
    const page = await mkPage("Original heading");
    await patchPage({
      request: apiReq("PATCH", `/pages/${page}?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { title: "Replacement heading" },
        test: true,
      }),
      params: { id: page },
    });
    expect((await query("Original")).body.data).toHaveLength(0);
    expect((await query("Replacement")).body.data).toHaveLength(1);
  });
});

describe("permissions (§7)", () => {
  it("gives a guest no pages and only their own team's issues", async () => {
    const page = await mkPage("payment runbook");
    await addParagraph(page, "escalation");

    const otherTeamRes = await createTeam({
      request: apiReq("POST", `/teams?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { name: "Other", key: "OTH" },
        test: true,
      }),
    });
    expect(otherTeamRes.status).toBe(201);
    const otherTeamId = (await bodyOf(otherTeamRes)).team.id as string;
    // POST /api/teams seeds no workflow states, so an issue cannot be filed in
    // the team it just created (T-036). Copy the default team's states across
    // until that lands; this fixture SQL should be deleted with it.
    for (const s of sqlite.prepare("SELECT name, category, position, color FROM states WHERE team_id = ?").all(env.teamId) as Array<{ name: string; category: string; position: string; color: string | null }>) {
      sqlite
        .prepare("INSERT INTO states (id, team_id, name, category, position, color) VALUES (?,?,?,?,?,?)")
        .run(`${otherTeamId}-${s.name}`, otherTeamId, s.name, s.category, s.position, s.color);
    }

    const mine = await createIssue({
      request: apiReq("POST", `/issues?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { teamId: env.teamId, title: "payment latency in checkout" },
        test: true,
      }),
    });
    const mineId = (await bodyOf(mine)).issue.id as string;
    const theirs = await createIssue({
      request: apiReq("POST", `/issues?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { teamId: otherTeamId, title: "payment retry storm" },
        test: true,
      }),
    });
    const theirsId = (await bodyOf(theirs)).issue.id as string;

    const guest = await addActor(sqlite, env.wsId, "sguest", "guest");
    sqlite
      .prepare("INSERT INTO team_members (id, team_id, user_id, created_at) VALUES (?,?,?,?)")
      .run(`tm-${guest.userId}`, env.teamId, guest.userId, Date.now());

    const asOwner = await query("payment");
    expect(asOwner.body.data.map((h: { entityId: string }) => h.entityId).sort()).toEqual(
      [page, mineId, theirsId].sort(),
    );

    const asGuest = await query("payment", "", guest.cookie);
    expect(asGuest.res.status).toBe(200);
    // No page, and not the other team's issue.
    expect(asGuest.body.data.map((h: { entityId: string }) => h.entityId)).toEqual([mineId]);
  });

  it("returns nothing for a workspace the caller does not belong to", async () => {
    await mkPage("payment runbook");
    const outsider = await docsEnv();
    const res = await search({
      request: apiReq("GET", `/search?wsId=${env.wsId}&q=payment`, { cookie: outsider.cookie }),
    });
    expect(res.status).toBe(404);
  });
});

describe("request handling", () => {
  it("filters by type", async () => {
    const page = await mkPage("payment runbook");
    await createIssue({
      request: apiReq("POST", `/issues?wsId=${env.wsId}`, {
        cookie: env.cookie,
        body: { teamId: env.teamId, title: "payment latency" },
        test: true,
      }),
    });
    const pagesOnly = await query("payment", "&types=page");
    expect(pagesOnly.body.data.map((h: { entityId: string }) => h.entityId)).toEqual([page]);
    expect((await query("payment", "&types=issue")).body.data).toHaveLength(1);
  });

  it("rejects a type the index cannot serve", async () => {
    const { res, body } = await query("payment", "&types=comment");
    expect(res.status).toBe(400);
    expect(body.error.details).toContain("types: comment");
  });

  it("pages through results with a stable cursor", async () => {
    for (let i = 0; i < 7; i++) await mkPage(`payment note ${i}`);
    const first = await query("payment", "&limit=3");
    expect(first.body.data).toHaveLength(3);
    expect(first.body.nextCursor).not.toBeNull();

    const second = await query("payment", `&limit=3&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.body.data).toHaveLength(3);
    const firstIds = first.body.data.map((h: { entityId: string }) => h.entityId);
    const secondIds = second.body.data.map((h: { entityId: string }) => h.entityId);
    // A partial sort order would let a row appear on both pages.
    expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
  });

  it("returns nothing for an empty query rather than everything", async () => {
    await mkPage("payment runbook");
    expect((await query("")).body.data).toEqual([]);
  });
});
