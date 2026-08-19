/**
 * The issue-write contract (T-005 remediation phases 3, 4, and 6).
 *
 * Every issue a bulk or an undo rewrites produces its own transition, the batch
 * flushes once per outermost run, and the consumer table is closed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createProjectRoute } from "@/pages/api/projects/index";
import { POST as createIssueRoute } from "@/pages/api/issues/index";
import { PATCH as patchIssue } from "@/pages/api/issues/[id]/index";
import { POST as bulkIssues } from "@/pages/api/issues/bulk";
import { POST as undoRoute } from "@/pages/api/undo/[token]";
import {
  changedFields,
  sseEventName,
  withIssueConsumers,
  type IssueConsumerName,
  type IssueTransition,
} from "@/lib/services/issues-events";
import { bulkUpdateIssues } from "@/lib/services/issues-bulk";
import { createIssue, trashIssue } from "@/lib/services/issues";
import { repairProjectProgress } from "@/lib/services/projects-progress";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function env(email: string, slug: string) {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "P", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  const userId = (await bodyOf(res)).user.id as string;
  return { wsId: data.workspace.id as string, teamId: data.defaultTeamId as string, cookie, userId };
}

async function project(wsId: string, cookie: string, name: string): Promise<string> {
  const res = await createProjectRoute({
    request: apiReq("POST", `/projects?wsId=${wsId}`, { cookie, body: { name }, test: true }),
  });
  return (await bodyOf(res)).project.id as string;
}

async function issue(
  wsId: string,
  cookie: string,
  teamId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await createIssueRoute({
    request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "T", ...body }, test: true }),
  });
  return (await bodyOf(res)).issue.id as string;
}

function stateIdOf(teamId: string, category: string): string {
  return (sqlite.prepare("SELECT id FROM states WHERE team_id = ? AND category = ?").get(teamId, category) as {
    id: string;
  }).id;
}

function cacheOf(projectId: string): { cache: number; points: string } {
  return sqlite
    .prepare("SELECT progress_cache AS cache, progress_points_cache AS points FROM projects WHERE id = ?")
    .get(projectId) as { cache: number; points: string };
}

describe("undo restores every affected project, not just the first", () => {
  it("bulk-moves across two source projects and undoes all three caches", async () => {
    const { wsId, teamId, cookie } = await env("undo@x.com", "undo-ws");
    const [a, b, c] = [await project(wsId, cookie, "A"), await project(wsId, cookie, "B"), await project(wsId, cookie, "C")];
    const done = stateIdOf(teamId, "completed");

    const ids: string[] = [];
    for (const projectId of [a, a, b, b]) {
      ids.push(await issue(wsId, cookie, teamId, { projectId, estimate: 2 }));
    }
    for (const id of [ids[0], ids[2]]) {
      await patchIssue({
        request: apiReq("PATCH", `/issues/${id}?wsId=${wsId}`, { cookie, body: { stateId: done }, test: true }),
        params: { id },
      });
    }
    expect(cacheOf(a).cache).toBe(50);
    expect(cacheOf(b).cache).toBe(50);

    const bulk = await bulkIssues({
      request: apiReq("POST", `/issues/bulk?wsId=${wsId}`, {
        cookie,
        body: { ids, action: "project", value: c },
        test: true,
      }),
    });
    const token = (await bodyOf(bulk)).undoToken as string;
    expect(cacheOf(a).cache).toBe(0);
    expect(cacheOf(b).cache).toBe(0);
    expect(cacheOf(c).cache).toBe(50);

    const original = sqlite.prepare.bind(sqlite);
    const prepared: string[] = [];
    sqlite.prepare = ((source: string) => {
      prepared.push(source);
      return original(source);
    }) as typeof sqlite.prepare;
    try {
      const res = await undoRoute({
        request: apiReq("POST", `/undo/${token}?wsId=${wsId}`, { cookie, test: true }),
        params: { token },
      });
      expect(res.status).toBe(200);
    } finally {
      sqlite.prepare = original;
    }

    const observed = [a, b, c].map(cacheOf);
    for (const id of [a, b, c]) repairProjectProgress(wsId, id);
    const repaired = [a, b, c].map(cacheOf);
    expect(observed.map((o) => o.cache)).toEqual([50, 50, 0]);
    expect(observed).toEqual(repaired);

    // One UPDATE projects per affected project, not one per issue.
    const projectWrites = prepared.filter((sql) => /^update\s+"?projects"?/i.test(sql.trim()));
    expect(projectWrites.length).toBeLessThanOrEqual(3);
  });
});

describe("the consumer table and the derived event names", () => {
  it("hands each consumer one transition per issue, once per outermost run", async () => {
    const { wsId, teamId, cookie, userId } = await env("seam@x.com", "seam-ws");
    const p = await project(wsId, cookie, "P");
    const ids = [
      await issue(wsId, cookie, teamId, { projectId: p, estimate: 1 }),
      await issue(wsId, cookie, teamId, { projectId: p, estimate: 1 }),
      await issue(wsId, cookie, teamId, { projectId: p, estimate: 1 }),
    ];
    const done = stateIdOf(teamId, "completed");
    const actor = { userId, role: "owner" as const };

    const batches: IssueTransition[][] = [];
    withIssueConsumers([(batch) => batches.push([...batch.transitions])], () => {
      bulkUpdateIssues(wsId, actor, { ids, action: "state", value: done });
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
    expect(batches[0].map((t) => t.after.id).sort()).toEqual([...ids].sort());
    expect(batches[0].every((t) => t.cause === "bulk")).toBe(true);
    expect(batches[0].every((t) => t.before !== null)).toBe(true);
    expect(batches[0].map(sseEventName)).toEqual(["issue.updated", "issue.updated", "issue.updated"]);
    expect(Object.keys(changedFields(batches[0][0]))).toContain("stateId");
  });

  it("records a create as a null before-state and a trash as issue.deleted", async () => {
    const { wsId, teamId, cookie, userId } = await env("shape@x.com", "shape-ws");
    const p = await project(wsId, cookie, "P");
    const actor = { userId, role: "owner" as const };

    const seen: IssueTransition[] = [];
    const created = withIssueConsumers([(batch) => seen.push(...batch.transitions)], () =>
      createIssue(wsId, actor, { teamId, title: "New", projectId: p }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].before).toBeNull();
    expect(sseEventName(seen[0])).toBe("issue.created");
    expect(seen[0].cause).toBe("direct");

    seen.length = 0;
    withIssueConsumers([(batch) => seen.push(...batch.transitions)], () =>
      trashIssue(wsId, actor, created.id, undefined),
    );
    expect(seen).toHaveLength(1);
    expect(sseEventName(seen[0])).toBe("issue.deleted");
  });

  it("removes a seam consumer on return, including on throw", async () => {
    const { wsId, teamId, cookie, userId } = await env("throw@x.com", "throw-ws");
    const p = await project(wsId, cookie, "P");
    const actor = { userId, role: "owner" as const };
    let calls = 0;

    expect(() =>
      withIssueConsumers([() => (calls += 1)], () => {
        createIssue(wsId, actor, { teamId, title: "One", projectId: p });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(calls).toBe(1);

    createIssue(wsId, actor, { teamId, title: "Two", projectId: p });
    expect(calls).toBe(1);
  });

  it("names every consumer in the closed union", () => {
    const names: IssueConsumerName[] = ["progress"];
    expect(names).toEqual(["progress"]);
  });
});
