/** Cycles API: create/auto-number, window validation, status derivation, patch, scope. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createTeam } from "@/pages/api/teams/index";
import { GET as listCycles, POST as createCycle } from "@/pages/api/cycles/index";
import { PATCH as patchCycle } from "@/pages/api/cycles/[id]";
import { POST as scopeCycle } from "@/pages/api/cycles/[id]/scope";
import { POST as createIssue } from "@/pages/api/issues/index";
import { DELETE as deleteIssue } from "@/pages/api/issues/[id]/index";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

const HOUR = 3_600_000;
const futureWindow = () => ({ startsAt: Date.now() + HOUR, endsAt: Date.now() + 2 * HOUR });
const activeWindow = () => ({ startsAt: Date.now() - HOUR, endsAt: Date.now() + HOUR });

async function env(email = "cyc@x.com", slug = "cycle-ws"): Promise<{ wsId: string; teamId: string; cookie: string }> {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "Cycler", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Cycle Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id, teamId: data.defaultTeamId, cookie };
}

function q(wsId: string, extra = ""): string {
  return `wsId=${wsId}${extra}`;
}

async function mkCycle(cookie: string, wsId: string, body: Record<string, unknown>): Promise<Response> {
  return createCycle({ request: apiReq("POST", `/cycles?${q(wsId)}`, { cookie, body, test: true }) });
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

function cycleOf(issueId: string): string | null {
  const row = sqlite.prepare("SELECT cycle_id FROM issues WHERE id = ?").get(issueId) as { cycle_id: string | null };
  return row.cycle_id;
}

describe("cycles create + status", () => {
  it("auto-numbers per team, defaults name, derives status; 409 on number conflict", async () => {
    const { wsId, teamId, cookie } = await env();
    const a = await mkCycle(cookie, wsId, { teamId, ...futureWindow() });
    expect(a.status).toBe(201);
    const ca = (await bodyOf(a)).cycle;
    expect(ca.number).toBe(1);
    expect(ca.name).toBe("Cycle 1");
    expect(ca.status).toBe("future");
    expect(ca.stats).toEqual({ scope: { issues: 0, points: 0 }, completed: { issues: 0, points: 0 } });

    const cb = (await bodyOf(await mkCycle(cookie, wsId, { teamId, ...activeWindow() }))).cycle;
    expect(cb.number).toBe(2);
    expect(cb.status).toBe("active");

    expect((await bodyOf(await mkCycle(cookie, wsId, { teamId, number: 9, ...futureWindow() }))).cycle.number).toBe(9);
    expect((await bodyOf(await mkCycle(cookie, wsId, { teamId, ...futureWindow() }))).cycle.number).toBe(10);

    const conflict = await mkCycle(cookie, wsId, { teamId, number: 9, ...futureWindow() });
    expect(conflict.status).toBe(409);
    expect((await bodyOf(conflict)).error.code).toBe("CONFLICT");
  });

  it("rejects startsAt >= endsAt with 400", async () => {
    const { wsId, teamId, cookie } = await env();
    const now = Date.now();
    const bad = await mkCycle(cookie, wsId, { teamId, startsAt: now, endsAt: now });
    expect(bad.status).toBe(400);
    expect((await bodyOf(bad)).error.code).toBe("VALIDATION");
  });
});

describe("cycles patch", () => {
  it("renames, moves dates, re-derives status; enforces window on merged dates", async () => {
    const { wsId, teamId, cookie } = await env();
    const cycle = (await bodyOf(await mkCycle(cookie, wsId, { teamId, ...futureWindow() }))).cycle;
    expect(cycle.status).toBe("future");

    const activated = await patchCycle({
      request: apiReq("PATCH", `/cycles/${cycle.id}?${q(wsId)}`, {
        cookie,
        body: { startsAt: Date.now() - HOUR },
        test: true,
      }),
      params: { id: cycle.id },
    });
    expect(activated.status).toBe(200);
    expect((await bodyOf(activated)).cycle.status).toBe("active");

    const renamed = await patchCycle({
      request: apiReq("PATCH", `/cycles/${cycle.id}?${q(wsId)}`, { cookie, body: { name: "Sprint 42" }, test: true }),
      params: { id: cycle.id },
    });
    expect((await bodyOf(renamed)).cycle.name).toBe("Sprint 42");

    // end-early (FM-032): endsAt moved closer, window still valid, stays active
    const early = Date.now() + 5 * 60_000;
    const ended = await patchCycle({
      request: apiReq("PATCH", `/cycles/${cycle.id}?${q(wsId)}`, { cookie, body: { endsAt: early }, test: true }),
      params: { id: cycle.id },
    });
    const ce = (await bodyOf(ended)).cycle;
    expect(ce.endsAt).toBe(early);
    expect(ce.status).toBe("active");

    const bad = await patchCycle({
      request: apiReq("PATCH", `/cycles/${cycle.id}?${q(wsId)}`, {
        cookie,
        body: { endsAt: Date.now() - 2 * HOUR },
        test: true,
      }),
      params: { id: cycle.id },
    });
    expect(bad.status).toBe(400);
  });
});

describe("cycles scope", () => {
  it("add/remove sets and clears cycleId; returns scope counts", async () => {
    const { wsId, teamId, cookie } = await env();
    const cycle = (await bodyOf(await mkCycle(cookie, wsId, { teamId, ...activeWindow() }))).cycle;
    const i1 = await mkIssue(cookie, wsId, teamId, { estimate: 2 });
    const i2 = await mkIssue(cookie, wsId, teamId, { estimate: 3 });
    const i3 = await mkIssue(cookie, wsId, teamId);

    const added = await scopeReq(cookie, wsId, cycle.id, { add: [i1.id, i2.id, i3.id] });
    expect(added.status).toBe(200);
    expect((await bodyOf(added)).scope).toEqual({ issues: 3, points: 5 });
    expect(cycleOf(i1.id)).toBe(cycle.id);
    expect(cycleOf(i3.id)).toBe(cycle.id);

    const removed = await scopeReq(cookie, wsId, cycle.id, { remove: [i1.id] });
    expect((await bodyOf(removed)).scope).toEqual({ issues: 2, points: 3 });
    expect(cycleOf(i1.id)).toBeNull();
    expect(cycleOf(i2.id)).toBe(cycle.id);
  });

  it("bumps version per issue even when the batch holds mixed versions", async () => {
    const { wsId, teamId, cookie } = await env();
    const cycle = (await bodyOf(await mkCycle(cookie, wsId, { teamId, ...activeWindow() }))).cycle;
    const i1 = await mkIssue(cookie, wsId, teamId);
    const i2 = await mkIssue(cookie, wsId, teamId);
    sqlite.prepare("UPDATE issues SET version = 7 WHERE id = ?").run(i2.id);

    const versionOf = (id: string): number =>
      (sqlite.prepare("SELECT version AS v FROM issues WHERE id = ?").get(id) as { v: number }).v;
    const before1 = versionOf(i1.id);

    expect((await scopeReq(cookie, wsId, cycle.id, { add: [i1.id, i2.id] })).status).toBe(200);

    expect(versionOf(i1.id)).toBe(before1 + 1);
    expect(versionOf(i2.id)).toBe(8);
  });

  it("400 lists unknown, trashed, and wrong-team issue ids; nothing is applied", async () => {
    const { wsId, teamId, cookie } = await env();
    const cycle = (await bodyOf(await mkCycle(cookie, wsId, { teamId, ...activeWindow() }))).cycle;
    const good = await mkIssue(cookie, wsId, teamId);
    const trashed = await mkIssue(cookie, wsId, teamId);
    await deleteIssue({
      request: apiReq("DELETE", `/issues/${trashed.id}?${q(wsId)}`, { cookie, test: true }),
      params: { id: trashed.id },
    });

    const team2Res = await createTeam({
      request: apiReq("POST", `/teams?${q(wsId)}`, { cookie, body: { key: "ENG", name: "Engineering" }, test: true }),
    });
    const team2 = (await bodyOf(team2Res)).team;
    // No hand-seeded state here any more: POST /teams provisions the default
    // workflow, so an issue can be filed in a new team directly (T-036).
    const foreign = await mkIssue(cookie, wsId, team2.id);

    const res = await scopeReq(cookie, wsId, cycle.id, { add: [good.id, "missing-id", trashed.id, foreign.id] });
    expect(res.status).toBe(400);
    const err = await bodyOf(res);
    expect(err.error.code).toBe("VALIDATION");
    expect(err.error.details).toEqual(expect.arrayContaining(["missing-id", trashed.id, foreign.id]));
    expect(err.error.details).not.toContain(good.id);
    expect(cycleOf(good.id)).toBeNull();
  });
});

describe("cycles list + workspace scoping", () => {
  it("lists cycles ordered by number with live stats; teamId required", async () => {
    const { wsId, teamId, cookie } = await env();
    await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const issue = await mkIssue(cookie, wsId, teamId, { estimate: 4 });
    const c2 = (await bodyOf(await mkCycle(cookie, wsId, { teamId, ...futureWindow() }))).cycle;
    await scopeReq(cookie, wsId, c2.id, { add: [issue.id] });

    const res = await listCycles({ request: apiReq("GET", `/cycles?${q(wsId, `&teamId=${teamId}`)}`, { cookie }) });
    expect(res.status).toBe(200);
    const data = (await bodyOf(res)).data;
    expect(data.map((c: { number: number }) => c.number)).toEqual([1, 2]);
    expect(data[1].stats.scope).toEqual({ issues: 1, points: 4 });

    const missing = await listCycles({ request: apiReq("GET", `/cycles?${q(wsId)}`, { cookie }) });
    expect(missing.status).toBe(400);
  });

  it("404s list, patch, and scope across workspaces", async () => {
    const a = await env("a@x.com", "ws-a");
    const b = await env("b@x.com", "ws-b");
    const cycle = (await bodyOf(await mkCycle(a.cookie, a.wsId, { teamId: a.teamId, ...activeWindow() }))).cycle;

    const list = await listCycles({
      request: apiReq("GET", `/cycles?${q(b.wsId, `&teamId=${a.teamId}`)}`, { cookie: b.cookie }),
    });
    expect(list.status).toBe(404);

    const patched = await patchCycle({
      request: apiReq("PATCH", `/cycles/${cycle.id}?${q(b.wsId)}`, { cookie: b.cookie, body: { name: "x" }, test: true }),
      params: { id: cycle.id },
    });
    expect(patched.status).toBe(404);

    const scoped = await scopeReq(b.cookie, b.wsId, cycle.id, { add: [] });
    expect(scoped.status).toBe(404);
  });
});

describe("cycle status re-derived on read", () => {
  function insertCycle(
    wsId: string,
    teamId: string,
    row: { id: string; number: number; status: string; startsAt: number; snapshot?: string | null },
  ): void {
    sqlite
      .prepare(
        `INSERT INTO cycles (id, workspace_id, team_id, number, name, starts_at, ends_at, status,
           closed_at, stats_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        row.id,
        wsId,
        teamId,
        row.number,
        `Cycle ${row.number}`,
        row.startsAt,
        row.startsAt + 2 * HOUR,
        row.status,
        row.snapshot ?? null,
        Date.now(),
      );
  }

  function storedStatus(id: string): string {
    return (sqlite.prepare("SELECT status FROM cycles WHERE id = ?").get(id) as { status: string }).status;
  }

  it("promotes a started cycle to active on list and persists the derived value", async () => {
    const { wsId, teamId, cookie } = await env("derive@x.com", "derive-ws");
    insertCycle(wsId, teamId, { id: "cyc-stale", number: 1, status: "future", startsAt: Date.now() - HOUR });
    expect(storedStatus("cyc-stale")).toBe("future");

    const res = await listCycles({ request: apiReq("GET", `/cycles?${q(wsId, `&teamId=${teamId}`)}`, { cookie }) });
    expect(res.status).toBe(200);
    const listed = (await bodyOf(res)).data.find((c: { id: string }) => c.id === "cyc-stale");
    expect(listed.status).toBe("active");
    expect(storedStatus("cyc-stale")).toBe("active");
  });

  it("leaves a completed cycle alone whatever its window says", async () => {
    const { wsId, teamId, cookie } = await env("done@x.com", "done-ws");
    insertCycle(wsId, teamId, {
      id: "cyc-done",
      number: 1,
      status: "completed",
      startsAt: Date.now() - HOUR,
      snapshot: JSON.stringify({ scope: { issues: 2, points: 4 }, completed: { issues: 1, points: 3 } }),
    });

    const res = await listCycles({ request: apiReq("GET", `/cycles?${q(wsId, `&teamId=${teamId}`)}`, { cookie }) });
    const listed = (await bodyOf(res)).data.find((c: { id: string }) => c.id === "cyc-done");
    expect(listed.status).toBe("completed");
    expect(listed.stats).toEqual({ scope: { issues: 2, points: 4 }, completed: { issues: 1, points: 3 } });
    expect(storedStatus("cyc-done")).toBe("completed");
  });

  it("serves zeroed stats for a malformed snapshot instead of 500ing the list", async () => {
    const { wsId, teamId, cookie } = await env("bad@x.com", "bad-ws");
    insertCycle(wsId, teamId, {
      id: "cyc-bad",
      number: 1,
      status: "completed",
      startsAt: Date.now() - HOUR,
      snapshot: "not json at all",
    });

    const res = await listCycles({ request: apiReq("GET", `/cycles?${q(wsId, `&teamId=${teamId}`)}`, { cookie }) });
    expect(res.status).toBe(200);
    const listed = (await bodyOf(res)).data.find((c: { id: string }) => c.id === "cyc-bad");
    expect(listed.stats).toEqual({ scope: { issues: 0, points: 0 }, completed: { issues: 0, points: 0 } });
  });
});
