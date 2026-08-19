/** Cycles close: stats freeze (FM-033), rollover (FM-031), idempotent 409. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { GET as listCycles, POST as createCycle } from "@/pages/api/cycles/index";
import { PATCH as patchCycle } from "@/pages/api/cycles/[id]";
import { POST as scopeCycle } from "@/pages/api/cycles/[id]/scope";
import { POST as closeCycle } from "@/pages/api/cycles/[id]/close";
import { POST as createIssue } from "@/pages/api/issues/index";
import { PATCH as patchIssue, DELETE as deleteIssue } from "@/pages/api/issues/[id]/index";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

const HOUR = 3_600_000;
const futureWindow = () => ({ startsAt: Date.now() + HOUR, endsAt: Date.now() + 2 * HOUR });
const activeWindow = () => ({ startsAt: Date.now() - HOUR, endsAt: Date.now() + HOUR });

async function env(email = "close@x.com", slug = "close-ws"): Promise<{ wsId: string; teamId: string; cookie: string }> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "Closer", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Close Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id, teamId: data.defaultTeamId, cookie };
}

function q(wsId: string, extra = ""): string {
  return `wsId=${wsId}${extra}`;
}

async function mkCycle(cookie: string, wsId: string, body: Record<string, unknown>) {
  const res = await createCycle({ request: apiReq("POST", `/cycles?${q(wsId)}`, { cookie, body, test: true }) });
  return (await bodyOf(res)).cycle;
}

async function mkIssue(cookie: string, wsId: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await createIssue({
    request: apiReq("POST", `/issues?${q(wsId)}`, { cookie, body: { teamId, title: "I", ...body }, test: true }),
  });
  return (await bodyOf(res)).issue;
}

function scopeReq(cookie: string, wsId: string, cycleId: string, body: Record<string, unknown>) {
  return scopeCycle({
    request: apiReq("POST", `/cycles/${cycleId}/scope?${q(wsId)}`, { cookie, body, test: true }),
    params: { id: cycleId },
  });
}

function closeReq(cookie: string, wsId: string, cycleId: string) {
  return closeCycle({
    request: apiReq("POST", `/cycles/${cycleId}/close?${q(wsId)}`, { cookie, test: true }),
    params: { id: cycleId },
  });
}

function stateId(teamId: string, category: string): string {
  const row = sqlite.prepare("SELECT id FROM states WHERE team_id = ? AND category = ?").get(teamId, category) as {
    id: string;
  };
  return row.id;
}

function cycleOf(issueId: string): string | null {
  const row = sqlite.prepare("SELECT cycle_id FROM issues WHERE id = ?").get(issueId) as { cycle_id: string | null };
  return row.cycle_id;
}

/** scope: 3 issues / 10 points (backlog 2 + started 3 + done 5); completed: 1 / 5. */
const FROZEN = { scope: { issues: 3, points: 10 }, completed: { issues: 1, points: 5 } };

async function cycleWithMixedScope(cookie: string, wsId: string, teamId: string) {
  const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
  const backlog = await mkIssue(cookie, wsId, teamId, { estimate: 2 });
  const started = await mkIssue(cookie, wsId, teamId, { estimate: 3, stateId: stateId(teamId, "started") });
  const done = await mkIssue(cookie, wsId, teamId, { estimate: 5, stateId: stateId(teamId, "completed") });
  const canceled = await mkIssue(cookie, wsId, teamId, { estimate: 7, stateId: stateId(teamId, "canceled") });
  await scopeReq(cookie, wsId, cycle.id, { add: [backlog.id, started.id, done.id, canceled.id] });
  return { cycle, backlog, started, done, canceled };
}

describe("cycles close", () => {
  it("freezes stats_snapshot at close; served stats never recompute", async () => {
    const { wsId, teamId, cookie } = await env();
    const { cycle, done } = await cycleWithMixedScope(cookie, wsId, teamId);

    const res = await closeReq(cookie, wsId, cycle.id);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.cycle.status).toBe("completed");
    expect(body.cycle.closedAt).not.toBeNull();
    expect(body.cycle.stats).toEqual(FROZEN);

    // mutate the completed issue that stayed in the closed cycle
    const bumped = await patchIssue({
      request: apiReq("PATCH", `/issues/${done.id}?${q(wsId)}`, { cookie, body: { estimate: 100 }, test: true }),
      params: { id: done.id },
    });
    expect(bumped.status).toBe(200);

    const listed = await listCycles({ request: apiReq("GET", `/cycles?${q(wsId, `&teamId=${teamId}`)}`, { cookie }) });
    const frozen = (await bodyOf(listed)).data.find((c: { id: string }) => c.id === cycle.id);
    expect(frozen.stats).toEqual(FROZEN);

    const snap = sqlite.prepare("SELECT stats_snapshot FROM cycles WHERE id = ?").get(cycle.id) as {
      stats_snapshot: string;
    };
    expect(JSON.parse(snap.stats_snapshot)).toEqual(FROZEN);
  });

  it("rolls exactly the open issues into an existing next cycle", async () => {
    const { wsId, teamId, cookie } = await env();
    const { cycle, backlog, started, done, canceled } = await cycleWithMixedScope(cookie, wsId, teamId);
    const trashed = await mkIssue(cookie, wsId, teamId);
    await scopeReq(cookie, wsId, cycle.id, { add: [trashed.id] });
    await deleteIssue({
      request: apiReq("DELETE", `/issues/${trashed.id}?${q(wsId)}`, { cookie, test: true }),
      params: { id: trashed.id },
    });
    const next = await mkCycle(cookie, wsId, { teamId, ...futureWindow() });

    const body = await bodyOf(await closeReq(cookie, wsId, cycle.id));
    expect(body.rollover).toEqual({ count: 2, nextCycleId: next.id, nextCycleCreated: false });
    expect(cycleOf(backlog.id)).toBe(next.id);
    expect(cycleOf(started.id)).toBe(next.id);
    expect(cycleOf(done.id)).toBe(cycle.id);
    expect(cycleOf(canceled.id)).toBe(cycle.id);
    expect(cycleOf(trashed.id)).toBe(cycle.id);
  });

  it("auto-creates the next cycle when none exists", async () => {
    const { wsId, teamId, cookie } = await env();
    const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const open = await mkIssue(cookie, wsId, teamId);
    await scopeReq(cookie, wsId, cycle.id, { add: [open.id] });

    const body = await bodyOf(await closeReq(cookie, wsId, cycle.id));
    expect(body.rollover.count).toBe(1);
    expect(body.rollover.nextCycleCreated).toBe(true);

    const next = sqlite.prepare("SELECT * FROM cycles WHERE id = ?").get(body.rollover.nextCycleId) as {
      id: string;
      number: number;
      name: string;
      starts_at: number;
      ends_at: number;
      status: string;
    };
    expect(next.number).toBe(2);
    expect(next.name).toBe("Cycle 2");
    expect(next.starts_at).toBe(cycle.endsAt);
    expect(next.ends_at).toBe(cycle.endsAt + (cycle.endsAt - cycle.startsAt));
    expect(next.status).toBe("future");
    expect(cycleOf(open.id)).toBe(next.id);

    const listed = await listCycles({ request: apiReq("GET", `/cycles?${q(wsId, `&teamId=${teamId}`)}`, { cookie }) });
    expect((await bodyOf(listed)).data).toHaveLength(2);
  });

  it("rejects a second close, patch, and scope change on a completed cycle", async () => {
    const { wsId, teamId, cookie } = await env();
    const { cycle } = await cycleWithMixedScope(cookie, wsId, teamId);
    expect((await closeReq(cookie, wsId, cycle.id)).status).toBe(200);
    expect((await closeReq(cookie, wsId, cycle.id)).status).toBe(409);

    const patched = await patchCycle({
      request: apiReq("PATCH", `/cycles/${cycle.id}?${q(wsId)}`, { cookie, body: { name: "nope" }, test: true }),
      params: { id: cycle.id },
    });
    expect(patched.status).toBe(409);

    const issue = await mkIssue(cookie, wsId, teamId);
    expect((await scopeReq(cookie, wsId, cycle.id, { add: [issue.id] })).status).toBe(409);
  });

  it("404s closing a cycle from another workspace", async () => {
    const a = await env("ca@x.com", "cws-a");
    const b = await env("cb@x.com", "cws-b");
    const cycle = await mkCycle(a.cookie, a.wsId, { teamId: a.teamId, ...activeWindow() });
    expect((await closeReq(b.cookie, b.wsId, cycle.id)).status).toBe(404);
  });
});

describe("rollover picks the next cycle chronologically", () => {
  it("prefers the earliest start over the lowest number when they disagree", async () => {
    const { wsId, teamId, cookie } = await env("order@x.com", "order-ws");
    const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const open = await mkIssue(cookie, wsId, teamId);
    await scopeReq(cookie, wsId, cycle.id, { add: [open.id] });

    const soonHighNumber = await mkCycle(cookie, wsId, {
      teamId,
      number: 9,
      startsAt: Date.now() + 2 * HOUR,
      endsAt: Date.now() + 3 * HOUR,
    });
    const laterLowNumber = await mkCycle(cookie, wsId, {
      teamId,
      number: 5,
      startsAt: Date.now() + 5 * HOUR,
      endsAt: Date.now() + 6 * HOUR,
    });

    const body = await bodyOf(await closeReq(cookie, wsId, cycle.id));
    expect(body.rollover.nextCycleId).toBe(soonHighNumber.id);
    expect(body.rollover.nextCycleId).not.toBe(laterLowNumber.id);
    expect(cycleOf(open.id)).toBe(soonHighNumber.id);
  });
});
