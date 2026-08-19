/**
 * Cycle scope and rollover through the issue-write choke-point (phase 9).
 *
 * Fixtures backdate created_at past HISTORY_GRACE_MS, because recordFieldChange
 * folds edits made inside the 3-minute create window into the "created" row and
 * the history assertions would then fail for the wrong reason.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createCycleRoute } from "@/pages/api/cycles/index";
import { POST as scopeCycle } from "@/pages/api/cycles/[id]/scope";
import { POST as closeCycle } from "@/pages/api/cycles/[id]/close";
import { POST as createIssueRoute } from "@/pages/api/issues/index";
import { GET as issueHistory } from "@/pages/api/issues/[id]/history";
import { withIssueConsumers, type IssueTransition } from "@/lib/services/issues-events";
import { updateCycleScope } from "@/lib/services/cycles";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

const HOUR = 3_600_000;
const activeWindow = () => ({ startsAt: Date.now() - HOUR, endsAt: Date.now() + HOUR });
const laterWindow = () => ({ startsAt: Date.now() + HOUR, endsAt: Date.now() + 2 * HOUR });

async function env(email: string, slug: string) {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email, name: "C", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const userId = (await bodyOf(res)).user.id as string;
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Ws", slug }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id as string, teamId: data.defaultTeamId as string, cookie, userId };
}

async function mkCycle(cookie: string, wsId: string, body: Record<string, unknown>) {
  const res = await createCycleRoute({
    request: apiReq("POST", `/cycles?wsId=${wsId}`, { cookie, body, test: true }),
  });
  return (await bodyOf(res)).cycle;
}

/** An issue created outside the 3-minute history grace window. */
async function mkAgedIssue(cookie: string, wsId: string, teamId: string, body: Record<string, unknown> = {}) {
  const res = await createIssueRoute({
    request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "I", ...body }, test: true }),
  });
  const issue = (await bodyOf(res)).issue;
  sqlite.prepare("UPDATE issues SET created_at = ? WHERE id = ?").run(Date.now() - 10 * 60_000, issue.id);
  return issue;
}

function scopeReq(cookie: string, wsId: string, cycleId: string, body: Record<string, unknown>) {
  return scopeCycle({
    request: apiReq("POST", `/cycles/${cycleId}/scope?wsId=${wsId}`, { cookie, body, test: true }),
    params: { id: cycleId },
  });
}

/** Cycle-field history rows, oldest first, with the stored JSON decoded. */
async function cycleHistory(cookie: string, wsId: string, issueId: string) {
  const res = await issueHistory({
    request: apiReq("GET", `/issues/${issueId}/history?wsId=${wsId}`, { cookie }),
    params: { id: issueId },
  });
  const rows = (await bodyOf(res)).data as Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: number;
  }>;
  return rows
    .filter((r) => r.field === "cycle")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => ({
      oldValue: r.oldValue === null ? null : (JSON.parse(r.oldValue) as string),
      newValue: r.newValue === null ? null : (JSON.parse(r.newValue) as string),
    }));
}

describe("cycle scope writes through the choke-point", () => {
  it("records a cycle history row for every added and removed issue", async () => {
    const { wsId, teamId, cookie } = await env("scope@x.com", "scope-ws");
    const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const a = await mkAgedIssue(cookie, wsId, teamId);
    const b = await mkAgedIssue(cookie, wsId, teamId);

    expect((await scopeReq(cookie, wsId, cycle.id, { add: [a.id, b.id] })).status).toBe(200);
    for (const id of [a.id, b.id]) {
      const rows = await cycleHistory(cookie, wsId, id);
      expect(rows).toHaveLength(1);
      expect(rows[0].oldValue).toBeNull();
      expect(rows[0].newValue).toBe(cycle.id);
    }

    expect((await scopeReq(cookie, wsId, cycle.id, { remove: [a.id] })).status).toBe(200);
    const removed = await cycleHistory(cookie, wsId, a.id);
    expect(removed).toHaveLength(2);
    expect(removed[1].oldValue).toBe(cycle.id);
    expect(removed[1].newValue).toBeNull();
  });

  it("hands the consumer one transition per touched issue, cause 'cycle'", async () => {
    const { wsId, teamId, cookie, userId } = await env("seam@x.com", "seam-ws");
    const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const a = await mkAgedIssue(cookie, wsId, teamId);
    const b = await mkAgedIssue(cookie, wsId, teamId);
    const actor = { userId, role: "owner" as const };

    const seen: IssueTransition[][] = [];
    withIssueConsumers([(batch) => seen.push([...batch.transitions])], () => {
      updateCycleScope(wsId, actor, cycle.id, { add: [a.id, b.id] });
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(2);
    expect(seen[0].every((t) => t.cause === "cycle")).toBe(true);
    expect(seen[0].every((t) => t.before?.cycleId === null)).toBe(true);
    expect(seen[0].every((t) => t.after.cycleId === cycle.id)).toBe(true);

    seen.length = 0;
    withIssueConsumers([(batch) => seen.push([...batch.transitions])], () => {
      updateCycleScope(wsId, actor, cycle.id, { remove: [a.id] });
    });
    expect(seen[0]).toHaveLength(1);
    expect(seen[0][0].before?.cycleId).toBe(cycle.id);
    expect(seen[0][0].after.cycleId).toBeNull();
  });

  it("an id in both lists ends up added, and produces one add transition", async () => {
    const { wsId, teamId, cookie, userId } = await env("both@x.com", "both-ws");
    const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const a = await mkAgedIssue(cookie, wsId, teamId);
    const actor = { userId, role: "owner" as const };

    const seen: IssueTransition[] = [];
    withIssueConsumers([(batch) => seen.push(...batch.transitions)], () => {
      updateCycleScope(wsId, actor, cycle.id, { add: [a.id], remove: [a.id] });
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].after.cycleId).toBe(cycle.id);
    const row = sqlite.prepare("SELECT cycle_id FROM issues WHERE id = ?").get(a.id) as { cycle_id: string | null };
    expect(row.cycle_id).toBe(cycle.id);
  });

  it("batches the writes and issues no UPDATE projects for a cycle-only change", async () => {
    const { wsId, teamId, cookie, userId } = await env("cost@x.com", "cost-ws");
    const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const ids: string[] = [];
    for (let i = 0; i < 40; i += 1) ids.push((await mkAgedIssue(cookie, wsId, teamId)).id);

    const original = sqlite.prepare.bind(sqlite);
    const prepared: string[] = [];
    sqlite.prepare = ((source: string) => {
      prepared.push(source);
      return original(source);
    }) as typeof sqlite.prepare;
    try {
      updateCycleScope(wsId, { userId, role: "owner" }, cycle.id, { add: ids });
    } finally {
      sqlite.prepare = original;
    }

    const issueWrites = prepared.filter((s) => /^update\s+"?issues"?/i.test(s.trim()));
    expect(issueWrites).toHaveLength(1);
    expect(prepared.filter((s) => /^update\s+"?projects"?/i.test(s.trim()))).toHaveLength(0);
  });
});

describe("close rollover writes through the choke-point", () => {
  it("records a cycle history row naming the next cycle for every rolled issue", async () => {
    const { wsId, teamId, cookie } = await env("roll@x.com", "roll-ws");
    const cycle = await mkCycle(cookie, wsId, { teamId, ...activeWindow() });
    const open = await mkAgedIssue(cookie, wsId, teamId);
    await scopeReq(cookie, wsId, cycle.id, { add: [open.id] });
    const next = await mkCycle(cookie, wsId, { teamId, ...laterWindow() });

    const res = await closeCycle({
      request: apiReq("POST", `/cycles/${cycle.id}/close?wsId=${wsId}`, { cookie, test: true }),
      params: { id: cycle.id },
    });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).rollover.nextCycleId).toBe(next.id);

    const rows = await cycleHistory(cookie, wsId, open.id);
    expect(rows).toHaveLength(2);
    expect(rows[1].oldValue).toBe(cycle.id);
    expect(rows[1].newValue).toBe(next.id);
  });
});
