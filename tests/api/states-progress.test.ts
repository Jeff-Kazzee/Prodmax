/**
 * T-023: workflow state writes are counter-affecting writes.
 *
 * `PATCH /api/states/:id` can change a state's category and `DELETE` reassigns
 * every issue in the state. Both change what an issue contributes to its
 * project's materialized counters. Reads never recompute (architecture §9), so
 * nothing self-heals and the cache stays wrong until an unrelated edit happens
 * to touch one of the affected issues.
 *
 * Both cases below fail against the pre-T-023 tree.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createProjectRoute } from "@/pages/api/projects/index";
import { POST as createIssueRoute } from "@/pages/api/issues/index";
import { PATCH as patchState, DELETE as deleteState } from "@/pages/api/states/[id]/index";
import { repairProjectProgress } from "@/lib/services/projects-progress";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

interface Env {
  wsId: string;
  teamId: string;
  userId: string;
  cookie: string;
}

async function env(email: string, slug: string): Promise<Env> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "S", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const data = await bodyOf(
    await createWs({
      request: apiReq("POST", "/workspaces", { cookie, body: { name: "States Ws", slug }, test: true }),
    }),
  );
  const user = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string };
  return {
    wsId: data.workspace.id as string,
    teamId: data.defaultTeamId as string,
    userId: user.id,
    cookie,
  };
}

/** One state id per category, from the five a new team is provisioned with. */
function statesByCategory(teamId: string): Record<string, string> {
  const rows = sqlite.prepare("SELECT id, category FROM states WHERE team_id = ?").all(teamId) as Array<{
    id: string;
    category: string;
  }>;
  const out: Record<string, string> = {};
  for (const row of rows) out[row.category] ??= row.id;
  return out;
}

interface Cache {
  percent: number;
  done: number;
  total: number;
  issuesDone: number;
  issuesTotal: number;
}

/** The stored cache, straight out of SQLite. No endpoint, no recompute. */
function storedCache(projectId: string): Cache {
  const row = sqlite
    .prepare("SELECT progress_cache AS cache, progress_points_cache AS points FROM projects WHERE id = ?")
    .get(projectId) as { cache: number; points: string };
  return { percent: row.cache, ...(JSON.parse(row.points) as Omit<Cache, "percent">) };
}

async function seedProject(e: Env, name: string, stateId: string, estimates: number[]): Promise<string> {
  const projectId = (
    await bodyOf(
      await createProjectRoute({
        request: apiReq("POST", `/projects?wsId=${e.wsId}`, { cookie: e.cookie, body: { name }, test: true }),
      }),
    )
  ).project.id as string;
  for (const [i, estimate] of estimates.entries()) {
    await createIssueRoute({
      request: apiReq("POST", `/issues?wsId=${e.wsId}`, {
        cookie: e.cookie,
        body: { teamId: e.teamId, title: `${name} ${i}`, projectId, estimate, stateId },
        test: true,
      }),
    });
  }
  return projectId;
}

describe("T-023: state writes repair project progress", () => {
  it("PATCH changing a state's category moves every affected project's cache", async () => {
    const e = await env("patch-state@x.com", "patch-state-ws");
    const categories = statesByCategory(e.teamId);
    const started = categories.started;

    // Two projects share the state, so a repair scoped to one of them is not
    // enough to pass. A third sits in an untouched state and must not move.
    const alpha = await seedProject(e, "Alpha", started, [3, 5]);
    const beta = await seedProject(e, "Beta", started, [2]);
    const untouched = await seedProject(e, "Untouched", categories.unstarted, [7]);

    // A trashed issue in the state, and an issue in the state with no project.
    // Neither can move a counter, so both must stay out of the repair scan.
    // Without them the scan's deletedAt and projectId filters are not
    // load-bearing and a mutation deleting either would go unnoticed.
    const trashed = await seedProject(e, "Trashed", started, [11]);
    sqlite.prepare("UPDATE issues SET deleted_at = ? WHERE project_id = ?").run(Date.now(), trashed);
    repairProjectProgress(e.wsId, trashed);
    await createIssueRoute({
      request: apiReq("POST", `/issues?wsId=${e.wsId}`, {
        cookie: e.cookie,
        body: { teamId: e.teamId, title: "Orphan", estimate: 4, stateId: started },
        test: true,
      }),
    });

    expect(storedCache(alpha)).toEqual({ percent: 0, done: 0, total: 8, issuesDone: 0, issuesTotal: 2 });
    expect(storedCache(beta)).toEqual({ percent: 0, done: 0, total: 2, issuesDone: 0, issuesTotal: 1 });
    expect(storedCache(trashed)).toEqual({ percent: 0, done: 0, total: 0, issuesDone: 0, issuesTotal: 0 });

    const res = await patchState({
      request: apiReq("PATCH", `/states/${started}`, {
        cookie: e.cookie,
        body: { category: "completed" },
        test: true,
      }),
      params: { id: started },
    });
    expect(res.status).toBe(200);

    expect(storedCache(alpha)).toEqual({ percent: 100, done: 8, total: 8, issuesDone: 2, issuesTotal: 2 });
    expect(storedCache(beta)).toEqual({ percent: 100, done: 2, total: 2, issuesDone: 1, issuesTotal: 1 });
    expect(storedCache(untouched)).toEqual({ percent: 0, done: 0, total: 7, issuesDone: 0, issuesTotal: 1 });
    // The trashed issue stayed out of the counted set in the new category too.
    expect(storedCache(trashed)).toEqual({ percent: 0, done: 0, total: 0, issuesDone: 0, issuesTotal: 0 });
  });

  it("PATCH of name or color alone runs no repair", async () => {
    const e = await env("patch-name@x.com", "patch-name-ws");
    const categories = statesByCategory(e.teamId);
    const projectId = await seedProject(e, "Alpha", categories.completed, [4]);

    // A repair is idempotent, so comparing values before and after cannot tell
    // "no repair ran" from "a repair ran and rewrote the same numbers". Degrade
    // the cache to the legacy two-field shape instead: only a repair restores
    // the four-field shape, so the shape surviving is the assertion.
    const legacy = JSON.stringify({ done: 4, total: 4 });
    sqlite.prepare("UPDATE projects SET progress_points_cache = ? WHERE id = ?").run(legacy, projectId);

    const res = await patchState({
      request: apiReq("PATCH", `/states/${categories.completed}`, {
        cookie: e.cookie,
        body: { name: "Shipped", color: "#aabbcc" },
        test: true,
      }),
      params: { id: categories.completed },
    });
    expect(res.status).toBe(200);

    const points = sqlite
      .prepare("SELECT progress_points_cache AS points FROM projects WHERE id = ?")
      .get(projectId) as { points: string };
    expect(JSON.parse(points.points)).toEqual({ done: 4, total: 4 });
  });

  it("DELETE reassigning issues into another category moves the cache", async () => {
    const e = await env("delete-state@x.com", "delete-state-ws");
    const categories = statesByCategory(e.teamId);
    const completed = categories.completed;

    // Team default is "Todo" (unstarted), so the fallback lands the issues in a
    // different category and every completion count owes a move.
    const alpha = await seedProject(e, "Alpha", completed, [3, 5]);
    const beta = await seedProject(e, "Beta", completed, [2]);

    expect(storedCache(alpha)).toEqual({ percent: 100, done: 8, total: 8, issuesDone: 2, issuesTotal: 2 });
    expect(storedCache(beta)).toEqual({ percent: 100, done: 2, total: 2, issuesDone: 1, issuesTotal: 1 });

    const res = await deleteState({
      request: apiReq("DELETE", `/states/${completed}`, { cookie: e.cookie, test: true }),
      params: { id: completed },
    });
    expect(res.status).toBe(200);

    expect(storedCache(alpha)).toEqual({ percent: 0, done: 0, total: 8, issuesDone: 0, issuesTotal: 2 });
    expect(storedCache(beta)).toEqual({ percent: 0, done: 0, total: 2, issuesDone: 0, issuesTotal: 1 });
  });

  it("DELETE bumps version and records history for every reassigned issue", async () => {
    const e = await env("delete-trace@x.com", "delete-trace-ws");
    const categories = statesByCategory(e.teamId);
    const completed = categories.completed;
    await seedProject(e, "Alpha", completed, [3, 5]);

    // History folds edits within HISTORY_GRACE_MS of create into the "created"
    // row, so freshly seeded issues would record nothing. Age them past the
    // window: an admin deleting a state is acting on issues created long ago.
    //
    // completedAt is set here too, because createIssue does not run
    // stateTimestamps. Without it, asserting the reassignment CLEARS
    // completedAt passes whether or not the handler does anything, which is the
    // assertion-theater shape this file is trying to avoid. Falsified: removing
    // the stateTimestamps spread from the handler fails the assertion below.
    sqlite
      .prepare("UPDATE issues SET created_at = created_at - ?, completed_at = ? WHERE state_id = ?")
      .run(10 * 60 * 1000, Date.now() - 5000, completed);

    const versionsBefore = sqlite
      .prepare("SELECT id, version FROM issues WHERE state_id = ? ORDER BY id")
      .all(completed) as Array<{ id: string; version: number }>;
    expect(versionsBefore).toHaveLength(2);

    await deleteState({
      request: apiReq("DELETE", `/states/${completed}`, { cookie: e.cookie, test: true }),
      params: { id: completed },
    });

    // The team default is "Todo", and it survives, so it is the fallback. This
    // asserts the actual target rather than "not the deleted one", which every
    // sibling would satisfy.
    const teamDefault = (
      sqlite.prepare("SELECT default_state_id AS id FROM teams WHERE id = ?").get(e.teamId) as { id: string }
    ).id;

    for (const before of versionsBefore) {
      const after = sqlite
        .prepare("SELECT version, state_id, completed_at FROM issues WHERE id = ?")
        .get(before.id) as { version: number; state_id: string; completed_at: number | null };
      expect(after.version).toBe(before.version + 1);
      expect(after.state_id).toBe(teamDefault);
      // Leaving the completed category clears completedAt, exactly as the
      // canonical state change in updateIssue does via stateTimestamps.
      expect(after.completed_at).toBeNull();

      const history = sqlite
        .prepare(
          "SELECT actor_id, old_value, new_value FROM issue_history WHERE issue_id = ? AND field = 'state'",
        )
        .all(before.id) as Array<{ actor_id: string; old_value: string; new_value: string }>;
      // Exactly one row, with the values the right way round. A count alone
      // passes with the arguments reversed, a wrong actor, or duplicates.
      expect(history).toHaveLength(1);
      expect(JSON.parse(history[0].old_value)).toBe(completed);
      expect(JSON.parse(history[0].new_value)).toBe(teamDefault);
      expect(history[0].actor_id).toBe(e.userId);
    }
  });

  it("DELETE reports how many issues moved and where", async () => {
    const e = await env("delete-report@x.com", "delete-report-ws");
    const categories = statesByCategory(e.teamId);
    await seedProject(e, "Alpha", categories.completed, [3, 5, 1]);

    const payload = await bodyOf(
      await deleteState({
        request: apiReq("DELETE", `/states/${categories.completed}`, { cookie: e.cookie, test: true }),
        params: { id: categories.completed },
      }),
    );
    expect(payload.reassigned).toBe(3);
    expect(payload.fallbackStateId).toBe(
      (sqlite.prepare("SELECT default_state_id AS id FROM teams WHERE id = ?").get(e.teamId) as { id: string })
        .id,
    );
  });

  /**
   * Deliverable 3: a failed repair must not leave the schema edited and the
   * counters stale. A trigger that aborts any `projects` UPDATE makes the
   * repair fail on the real production path, with no mocking and no test-only
   * seam. Without the transaction both of these commit the schema change and
   * return 500 with the counters wrong, which is the exact state T-023 exists
   * to prevent.
   */
  const failProjectWrites = (): void => {
    sqlite.exec(
      "CREATE TRIGGER pmx_block_progress BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT, 'repair refused'); END",
    );
  };

  it("PATCH rolls the category back when the repair fails", async () => {
    const e = await env("patch-rollback@x.com", "patch-rollback-ws");
    const categories = statesByCategory(e.teamId);
    const started = categories.started;
    await seedProject(e, "Alpha", started, [3]);
    failProjectWrites();

    const res = await patchState({
      request: apiReq("PATCH", `/states/${started}`, {
        cookie: e.cookie,
        body: { category: "completed" },
        test: true,
      }),
      params: { id: started },
    });
    expect(res.status).toBe(500);

    const row = sqlite.prepare("SELECT category FROM states WHERE id = ?").get(started) as {
      category: string;
    };
    expect(row.category).toBe("started");
  });

  it("DELETE rolls the state back when the progress consumer fails", async () => {
    const e = await env("delete-rollback@x.com", "delete-rollback-ws");
    const categories = statesByCategory(e.teamId);
    const completed = categories.completed;
    await seedProject(e, "Alpha", completed, [3]);
    const versionBefore = (
      sqlite.prepare("SELECT version FROM issues WHERE state_id = ?").get(completed) as { version: number }
    ).version;
    failProjectWrites();

    const res = await deleteState({
      request: apiReq("DELETE", `/states/${completed}`, { cookie: e.cookie, test: true }),
      params: { id: completed },
    });
    expect(res.status).toBe(500);

    // The state survived, the issues never moved, and no version was consumed.
    const state = sqlite.prepare("SELECT id FROM states WHERE id = ?").get(completed);
    expect(state).toBeTruthy();
    const issue = sqlite.prepare("SELECT state_id, version FROM issues WHERE state_id = ?").get(completed) as {
      state_id: string;
      version: number;
    };
    expect(issue.state_id).toBe(completed);
    expect(issue.version).toBe(versionBefore);
  });
});
