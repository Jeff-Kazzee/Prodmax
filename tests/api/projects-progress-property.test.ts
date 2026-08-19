/**
 * Property test for the delta counters (T-005 remediation phase 5).
 *
 * After every step the incremented cache must equal what repairProjectProgress
 * computes for the same project. The generator is hand-rolled from a seeded
 * PRNG because adding fast-check edits the M0-owned package.json. A failing
 * seed is printed so the case can be replayed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createProjectRoute } from "@/pages/api/projects/index";
import { POST as createIssueRoute } from "@/pages/api/issues/index";
import { PATCH as patchIssue, DELETE as deleteIssue } from "@/pages/api/issues/[id]/index";
import { POST as bulkIssues } from "@/pages/api/issues/bulk";
import { POST as undoRoute } from "@/pages/api/undo/[token]";
import { repairProjectProgress } from "@/lib/services/projects-progress";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

/** mulberry32: 32 bits of state, deterministic, replayable from the seed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Env {
  wsId: string;
  teamId: string;
  cookie: string;
}

async function env(email: string, slug: string): Promise<Env> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "P", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Prop Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id as string, teamId: data.defaultTeamId as string, cookie };
}

function statesByCategory(teamId: string): Record<string, string> {
  const rows = sqlite.prepare("SELECT id, category FROM states WHERE team_id = ?").all(teamId) as Array<{
    id: string;
    category: string;
  }>;
  const out: Record<string, string> = {};
  for (const row of rows) out[row.category] ??= row.id;
  return out;
}

/** Stored cache for one project, straight out of SQLite. */
function storedCache(projectId: string): { cache: number; points: string } {
  return sqlite
    .prepare("SELECT progress_cache AS cache, progress_points_cache AS points FROM projects WHERE id = ?")
    .get(projectId) as { cache: number; points: string };
}

describe("incremented counters equal the repaired counters", () => {
  it("holds across a random sequence of writes", async () => {
    const seed = Number(process.env.PRODMAX_PROP_SEED ?? 20260819);
    const random = prng(seed);
    const { wsId, teamId, cookie } = await env("prop@x.com", "prop-ws");

    const projectIds: string[] = [];
    for (const name of ["A", "B", "C"]) {
      const res = await createProjectRoute({
        request: apiReq("POST", `/projects?wsId=${wsId}`, { cookie, body: { name }, test: true }),
      });
      projectIds.push((await bodyOf(res)).project.id as string);
    }
    const categories = statesByCategory(teamId);
    const stateIds = Object.values(categories);
    const issueIds: string[] = [];
    const undoTokens: string[] = [];

    const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];

    const restore = sqlite.prepare(
      "UPDATE projects SET progress_cache = ?, progress_points_cache = ? WHERE id = ?",
    );

    const assertAllProjectsConsistent = (step: number, action: string): void => {
      const observed = projectIds.map((id) => storedCache(id));
      for (const id of projectIds) repairProjectProgress(wsId, id);
      const repaired = projectIds.map((id) => storedCache(id));
      // Put the incremented values back, so drift has to accumulate rather
      // than being reset by the act of checking it.
      projectIds.forEach((id, i) => restore.run(observed[i].cache, observed[i].points, id));
      for (let i = 0; i < projectIds.length; i += 1) {
        const points = JSON.parse(observed[i].points) as Partial<{ issuesTotal: number }>;
        // A degraded row stays legacy until the next write touches it. From the
        // touch onward it is four-field and owes the same value as the repair.
        if (typeof points.issuesTotal !== "number") continue;
        const label = `seed ${seed}, step ${step}, action ${action}, project ${i}`;
        expect(observed[i].cache, label).toBe(repaired[i].cache);
        expect(points, label).toEqual(JSON.parse(repaired[i].points));
      }
    };

    // Rewriting a cache to the legacy two-field shape forces the next write on
    // that project down the repair branch, which must repair INSTEAD of
    // incrementing. Without this action nothing here ever reaches that branch.
    const degrade = sqlite.prepare("UPDATE projects SET progress_points_cache = ? WHERE id = ?");

    const actions = [
      "create",
      "state",
      "project",
      "estimate",
      "trash",
      "bulkProject",
      "undo",
      "legacyCache",
    ] as const;

    for (let step = 0; step < 90; step += 1) {
      const action = pick([...actions]);
      switch (action) {
        case "create": {
          const res = await createIssueRoute({
            request: apiReq("POST", `/issues?wsId=${wsId}`, {
              cookie,
              body: {
                teamId,
                title: `Issue ${step}`,
                projectId: random() < 0.8 ? pick(projectIds) : undefined,
                estimate: Math.floor(random() * 9),
                stateId: pick(stateIds),
              },
              test: true,
            }),
          });
          const created = (await bodyOf(res)).issue as { id: string } | undefined;
          if (created) issueIds.push(created.id);
          break;
        }
        case "state":
        case "project":
        case "estimate": {
          if (issueIds.length === 0) break;
          const id = pick(issueIds);
          const body =
            action === "state"
              ? { stateId: pick(stateIds) }
              : action === "project"
                ? { projectId: random() < 0.85 ? pick(projectIds) : null }
                : { estimate: Math.floor(random() * 13) };
          await patchIssue({
            request: apiReq("PATCH", `/issues/${id}?wsId=${wsId}`, { cookie, body, test: true }),
            params: { id },
          });
          break;
        }
        case "trash": {
          if (issueIds.length === 0) break;
          const id = pick(issueIds);
          await deleteIssue({
            request: apiReq("DELETE", `/issues/${id}?wsId=${wsId}`, { cookie, test: true }),
            params: { id },
          });
          issueIds.splice(issueIds.indexOf(id), 1);
          break;
        }
        case "bulkProject": {
          if (issueIds.length < 2) break;
          const ids = issueIds.slice(0, Math.min(issueIds.length, 1 + Math.floor(random() * 4)));
          const moveProject = random() < 0.5;
          const res = await bulkIssues({
            request: apiReq("POST", `/issues/bulk?wsId=${wsId}`, {
              cookie,
              body: {
                ids,
                action: moveProject ? "project" : "state",
                value: moveProject ? pick(projectIds) : pick(stateIds),
              },
              test: true,
            }),
          });
          const payload = await bodyOf(res);
          if (typeof payload.undoToken === "string") undoTokens.push(payload.undoToken);
          break;
        }
        case "undo": {
          const token = undoTokens.shift();
          if (!token) break;
          await undoRoute({
            request: apiReq("POST", `/undo/${token}?wsId=${wsId}`, { cookie, test: true }),
            params: { token },
          });
          break;
        }
        case "legacyCache": {
          const id = pick(projectIds);
          const current = JSON.parse(storedCache(id).points) as { done: number; total: number };
          degrade.run(JSON.stringify({ done: current.done, total: current.total }), id);
          break;
        }
      }
      if (action === "legacyCache") continue;
      assertAllProjectsConsistent(step, action);
    }
  }, 120_000);
});
