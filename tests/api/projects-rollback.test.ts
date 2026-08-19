/**
 * The failure policy (T-005 remediation phase 11).
 *
 * A consumer that throws rolls the issue write back. Under §9 a committed issue
 * write with a stale counter is the state this whole plan exists to prevent, so
 * rolling back is the decision rather than an accident of where the call sits.
 * Every assertion reads the row out of SQLite, because the question is whether
 * the write persisted, not what a response body claimed.
 *
 * These drive the services rather than the route handlers. `withIssueConsumers`
 * refuses an async callback on purpose, since one would outlive the seam, and
 * every route handler is async. The transaction boundary is entirely inside the
 * service, so the service is where the claim can be tested.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { createIssue, trashIssue } from "@/lib/services/issues";
import { updateIssue } from "@/lib/services/issues-update";
import { bulkUpdateIssues } from "@/lib/services/issues-bulk";
import { withIssueConsumers } from "@/lib/services/issues-events";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

const boom = (): never => {
  throw new Error("consumer refused the batch");
};

interface Env {
  wsId: string;
  teamId: string;
  actor: { userId: string; role: "owner" };
  doneStateId: string;
}

async function env(): Promise<Env> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email: "rb@x.com", name: "RB", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const userId = (await bodyOf(res)).user.id as string;
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "RB Ws", slug: "rb-ws" }, test: true }),
  });
  const data = await bodyOf(wsRes);
  const done = sqlite
    .prepare("SELECT id FROM states WHERE team_id = ? AND category = 'completed' LIMIT 1")
    .get(data.defaultTeamId) as { id: string };
  return {
    wsId: data.workspace.id,
    teamId: data.defaultTeamId,
    actor: { userId, role: "owner" },
    doneStateId: done.id,
  };
}

function mkIssue(e: Env): string {
  return createIssue(e.wsId, e.actor, { teamId: e.teamId, title: "rollback fixture", estimate: 2 }).id;
}

function issueRow(id: string): { state_id: string; version: number; deleted_at: number | null } {
  return sqlite.prepare("SELECT state_id, version, deleted_at FROM issues WHERE id = ?").get(id) as {
    state_id: string;
    version: number;
    deleted_at: number | null;
  };
}

describe("a throwing consumer rolls the issue write back", () => {
  it("leaves the row and its version untouched on a single write", async () => {
    const e = await env();
    const id = mkIssue(e);
    const before = issueRow(id);

    expect(() =>
      withIssueConsumers([boom], () => updateIssue(e.wsId, e.actor, id, { stateId: e.doneStateId }, undefined)),
    ).toThrow("consumer refused the batch");

    expect(issueRow(id)).toEqual(before);
  });

  it("takes the whole batch with it, not just the offending row", async () => {
    const e = await env();
    const ids = Array.from({ length: 20 }, () => mkIssue(e));
    const before = ids.map(issueRow);

    expect(() =>
      withIssueConsumers([boom], () =>
        bulkUpdateIssues(e.wsId, e.actor, { ids, action: "state", value: e.doneStateId }),
      ),
    ).toThrow("consumer refused the batch");

    expect(ids.map(issueRow)).toEqual(before);
    expect(sqlite.prepare("SELECT count(*) AS n FROM undo_tokens").get()).toEqual({ n: 0 });
  });

  it("rolls a trash back too, so the row is still live", async () => {
    const e = await env();
    const id = mkIssue(e);

    expect(() => withIssueConsumers([boom], () => trashIssue(e.wsId, e.actor, id, undefined))).toThrow(
      "consumer refused the batch",
    );

    expect(issueRow(id).deleted_at).toBeNull();
  });

  it("lands the write and bumps the version when no consumer throws", async () => {
    const e = await env();
    const id = mkIssue(e);
    const before = issueRow(id);

    updateIssue(e.wsId, e.actor, id, { stateId: e.doneStateId }, undefined);

    const after = issueRow(id);
    expect(after.state_id).toBe(e.doneStateId);
    expect(after.version).toBe(before.version + 1);
  });
});
