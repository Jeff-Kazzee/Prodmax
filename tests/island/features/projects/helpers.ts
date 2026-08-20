/**
 * S-15 fixtures.
 *
 * The progress numbers are chosen so a read-time recompute cannot pass by
 * coincidence. The cache says 62% with 12/31 issues and 41/78 points, while
 * the mocked issue list is 31 issues that are ALL complete. A screen that
 * derived progress from issues would render 100%, and one that derived it from
 * the points pair would render 53%. Only a cache read produces 62.
 */
import { vi, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { DEMO_ME, jsonResponse } from "../../../shell/helpers";
import { issueFixture, STATE_PROG, STATE_TODO, TEAM } from "../issues/helpers";
import type { MilestoneDto, ProjectDto, ProjectUpdateDto } from "@island/features/projects/types";

export const STATE_DONE = {
  id: "st-done",
  teamId: "t1",
  name: "Done",
  category: "completed",
  position: "c",
  color: "#3fb950",
};

export const STATE_CANCELLED = {
  id: "st-cancelled",
  teamId: "t1",
  name: "Cancelled",
  category: "canceled",
  position: "d",
  color: "#666666",
};

export function projectFixture(over: Partial<ProjectDto> = {}): ProjectDto {
  return {
    id: "p1",
    workspaceId: "ws1",
    name: "Checkout rewrite",
    descriptionMd: null,
    status: "started",
    leadId: "u1",
    targetStartDate: "2026-08-01",
    targetEndDate: "2026-09-12",
    color: "#f5a524",
    briefPageId: null,
    position: "a0",
    progressCache: 62,
    progressPoints: { done: 41, total: 78, issuesDone: 12, issuesTotal: 31 },
    updateCadence: "off",
    archivedAt: null,
    deletedAt: null,
    createdAt: 1,
    updatedAt: 2,
    lastUpdateAt: null,
    favorited: false,
    ...over,
  };
}

export function milestoneFixture(over: Partial<MilestoneDto> = {}): MilestoneDto {
  return {
    id: "m1",
    workspaceId: "ws1",
    projectId: "p1",
    name: "Stabilize payouts",
    targetDate: "2026-08-30",
    position: "a0",
    createdAt: 1,
    deletedAt: null,
    progress: { total: 20, startedOrCompleted: 12, completed: 9, pointsTotal: 40, pointsDone: 18 },
    ...over,
  };
}

export function updateFixture(over: Partial<ProjectUpdateDto> = {}): ProjectUpdateDto {
  return {
    id: "up1",
    workspaceId: "ws1",
    projectId: "p1",
    authorId: "u1",
    health: "on_track",
    bodyMd: "Checkout API frozen",
    progressSnapshot: 62,
    createdAt: 1_700_000_000_000,
    ...over,
  };
}

/** 31 issues, every one complete. A scan would read 100%, never 62%. */
export function allDoneIssues(count = 31) {
  return Array.from({ length: count }, (_, i) =>
    issueFixture({
      id: `iss${i + 1}`,
      identifier: `PRO-${i + 1}`,
      title: `Done issue ${i + 1}`,
      stateId: STATE_DONE.id,
      projectId: "p1",
      estimate: 1,
      completedAt: 1_700_000_000_000,
    }),
  );
}

export interface ProjectMock {
  fetchMock: Mock;
  /** Every /api/issues URL the app requested, in order. */
  issueCalls: string[];
  /** Bodies of every recorded mutation, keyed by "METHOD path". */
  sent: Array<{ key: string; body: unknown }>;
}

type RouteMap = Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>;

/**
 * Fetch mock that records /api/issues traffic. The recorder is the sensor the
 * no-scan assertion depends on, so every suite that asserts an empty log must
 * also drive a path that fills it. An empty log with a dead sensor proves
 * nothing.
 */
export function mockProjectRoutes(extra: RouteMap = {}, issues = allDoneIssues()): ProjectMock {
  const issueCalls: string[] = [];
  const sent: Array<{ key: string; body: unknown }> = [];

  const base: RouteMap = {
    "GET /api/auth/me": DEMO_ME,
    "GET /api/teams": { data: [TEAM] },
    "GET /api/teams/t1/states": {
      data: [STATE_TODO, STATE_PROG, STATE_DONE, STATE_CANCELLED],
    },
    "GET /api/labels": { data: [] },
    "GET /api/workspaces/ws1/members": { data: [{ userId: "u1", name: "Demo User" }] },
    "GET /api/views": { data: [], nextCursor: null },
    "GET /api/projects": { data: [projectFixture()], nextCursor: null },
    "GET /api/projects/p1": { project: projectFixture() },
    "GET /api/projects/p1/milestones": { data: [milestoneFixture()], nextCursor: null },
    "GET /api/projects/p1/updates": { data: [], nextCursor: null },
  };

  const routes: RouteMap = { ...base, ...extra };

  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const pathOnly = path.split("?")[0] ?? path;

    if (pathOnly === "/api/issues") {
      issueCalls.push(path);
      if (method === "GET") {
        return Promise.resolve(jsonResponse(200, { data: issues, nextCursor: null }));
      }
    }
    if (method !== "GET") {
      sent.push({ key: `${method} ${pathOnly}`, body: JSON.parse(String(init?.body ?? "null")) });
    }

    const hit = routes[`${method} ${path}`] ?? routes[`${method} ${pathOnly}`];
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
  return { fetchMock: impl, issueCalls, sent };
}

/**
 * Navigation is in-app on purpose. `createBrowserRouter` is built once at
 * module scope in app.tsx, so it reads window.location when the module is
 * imported and never sees a later replaceState. Clicking through the shell is
 * both what a user does and the only thing the router reacts to.
 */
async function clickNav(name: string): Promise<void> {
  const navs = await screen.findAllByRole("navigation", { name: "Workspace sections" });
  fireEvent.click(within(navs[0] as HTMLElement).getByRole("link", { name }));
}

/**
 * Park on Home before a test asserts about request traffic.
 *
 * The router is module state, so it keeps whatever location the previous test
 * in this file left it on, and a fresh render can briefly mount that screen and
 * fire its requests. Home is a pending screen that fetches nothing, so landing
 * here first gives a test a quiet line to clear before it navigates to the
 * screen it actually means to measure. Clearing the recorder here rather than
 * after arriving keeps a load-time scan on the target screen visible.
 */
export async function gotoHome(): Promise<void> {
  await clickNav("Home");
  await screen.findByRole("heading", { name: "Home" });
}

export async function gotoProjects(): Promise<void> {
  await clickNav("Projects");
  await screen.findByRole("heading", { name: "Projects" });
}

/** Open a project from the R-17 list. */
export async function gotoProject(name = "Checkout rewrite"): Promise<void> {
  await gotoProjects();
  fireEvent.click(await screen.findByRole("link", { name }));
}

/** Open the current cycle from the sidebar. */
export async function gotoCurrentCycle(): Promise<void> {
  await clickNav("Current cycle");
}
