/**
 * Issue-view test fixtures + fetch mock that matches path prefixes
 * (query strings on /api/issues etc. are not stable).
 */
import { vi, type Mock } from "vitest";
import { jsonResponse, DEMO_ME } from "../../../shell/helpers";
import type { IssueListItem } from "@island/features/issues/types";

export const TEAM = {
  id: "t1",
  workspaceId: "ws1",
  key: "PRO",
  name: "Product",
  description: null,
  timezone: null,
  position: "a",
  triageEnabled: 1,
  cyclesEnabled: 0,
};

export const STATE_TODO = {
  id: "st-todo",
  teamId: "t1",
  name: "Todo",
  category: "unstarted",
  position: "a",
  color: "#888888",
};

export const STATE_PROG = {
  id: "st-prog",
  teamId: "t1",
  name: "In Progress",
  category: "started",
  position: "b",
  color: "#3366aa",
};

export const STATE_TRIAGE = {
  id: "st-triage",
  teamId: "t1",
  name: "Triage",
  category: "triage",
  position: "z",
  color: "#b08cf2",
};

export const STATE_CANCELED = {
  id: "st-canceled",
  teamId: "t1",
  name: "Canceled",
  category: "canceled",
  position: "y",
  color: "#666666",
};

export function issueFixture(over: Partial<IssueListItem> = {}): IssueListItem {
  return {
    id: "iss1",
    workspaceId: "ws1",
    teamId: "t1",
    number: 1,
    identifier: "PRO-1",
    title: "Fix login race",
    stateId: "st-todo",
    priority: 3,
    estimate: 2,
    assigneeId: "u1",
    creatorId: "u1",
    projectId: null,
    milestoneId: null,
    cycleId: null,
    parentId: null,
    dueDate: null,
    position: "a0",
    version: 1,
    archivedAt: null,
    createdAt: 1,
    updatedAt: 2,
    completedAt: null,
    labelIds: [],
    ...over,
  };
}

export function issueDetail(over: Partial<IssueListItem> & { descriptionMd?: string } = {}) {
  const { descriptionMd, ...rest } = over;
  return {
    ...issueFixture(rest),
    descriptionMd: descriptionMd ?? "Fix the race on refresh.",
    triagedAt: null,
  };
}

export function commentFixture(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    workspaceId: "ws1",
    entityType: "issue",
    entityId: "iss1",
    parentId: null,
    authorId: "u1",
    bodyMd: "Looks good",
    resolvedAt: null,
    resolvedBy: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

export function mockFetchPrefix(
  routes: Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>,
): Mock {
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const pathOnly = path.split("?")[0] ?? path;
    const hit =
      routes[`${method} ${path}`] ??
      routes[`${method} ${pathOnly}`] ??
      routes[`${method} ${pathOnly}*`];
    if (hit === undefined) {
      return Promise.resolve(
        jsonResponse(404, { error: { code: "NOT_FOUND", message: `no route ${method} ${path}` } }),
      );
    }
    const body = typeof hit === "function" ? hit(path, init) : hit;
    if (body instanceof Response) return Promise.resolve(body);
    return Promise.resolve(jsonResponse(200, body));
  });
  vi.stubGlobal("fetch", impl);
  return impl;
}

export function defaultIssueRoutes(issues: IssueListItem[] = [issueFixture()]): Record<string, unknown> {
  const detail = issueDetail(issues[0] ?? issueFixture());
  return {
    "GET /api/auth/me": DEMO_ME,
    "GET /api/teams": { data: [TEAM] },
    "GET /api/teams/t1/states": { data: [STATE_TODO, STATE_PROG, STATE_TRIAGE, STATE_CANCELED] },
    "GET /api/labels": { data: [] },
    "GET /api/workspaces/ws1/members": { data: [{ userId: "u1", name: "Demo User" }] },
    "GET /api/issues": { data: issues, nextCursor: null },
    "GET /api/views": { data: [], nextCursor: null },
    "GET /api/issues/PRO-1": { issue: detail },
    "GET /api/issues/iss1": { issue: detail },
    "GET /api/issues/PRO-1/subscribers": { data: [{ issueId: "iss1", userId: "u1", reason: "created" }] },
    "PATCH /api/issues/PRO-1": { issue: detail },
    "PATCH /api/issues/iss1": { issue: detail },
  };
}
