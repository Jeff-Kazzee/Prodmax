/**
 * S-16 fixtures.
 *
 * The scoped set is built so the rollover rule is discriminating: 3 open, 2
 * completed, 1 canceled. A preview that ignores state category reads 6, one
 * that excludes only completed reads 4, and only the server's actual rule
 * reads 3.
 */
import { vi, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import { DEMO_ME, jsonResponse } from "../../../shell/helpers";
import { issueFixture, STATE_PROG, STATE_TODO, TEAM } from "../issues/helpers";
import { STATE_CANCELLED, STATE_DONE } from "../projects/helpers";
import type { CycleDto } from "@island/features/cycles/types";

export const CYCLE_TEAM = { ...TEAM, cyclesEnabled: 1, autoAddToCycle: 0 };
export const OTHER_TEAM = {
  ...TEAM,
  id: "t2",
  key: "OPS",
  name: "Operations",
  position: "b",
  cyclesEnabled: 0,
  autoAddToCycle: 0,
};

export function cycleFixture(over: Partial<CycleDto> = {}): CycleDto {
  return {
    id: "c2",
    workspaceId: "ws1",
    teamId: "t1",
    number: 2,
    name: "Cycle 2",
    startsAt: 1_700_000_000_000,
    endsAt: 1_700_000_000_000 + 14 * 86_400_000,
    status: "active",
    closedAt: null,
    createdAt: 1_700_000_000_000,
    stats: {
      scope: { issues: 6, points: 12 },
      completed: { issues: 2, points: 4 },
    },
    ...over,
  };
}

/** 3 open, 2 completed, 1 canceled. Only the real rule yields 3. */
export function scopedIssues() {
  return [
    issueFixture({ id: "iss1", identifier: "PRO-1", title: "Open one", stateId: STATE_TODO.id, cycleId: "c2", estimate: 2 }),
    issueFixture({ id: "iss2", identifier: "PRO-2", title: "Open two", stateId: STATE_TODO.id, cycleId: "c2", estimate: 3 }),
    issueFixture({ id: "iss3", identifier: "PRO-3", title: "Open three", stateId: STATE_PROG.id, cycleId: "c2", estimate: 1 }),
    issueFixture({ id: "iss4", identifier: "PRO-4", title: "Done one", stateId: STATE_DONE.id, cycleId: "c2", estimate: 2, completedAt: 1_700_100_000_000 }),
    issueFixture({ id: "iss5", identifier: "PRO-5", title: "Done two", stateId: STATE_DONE.id, cycleId: "c2", estimate: 2, completedAt: 1_700_200_000_000 }),
    issueFixture({ id: "iss6", identifier: "PRO-6", title: "Dropped", stateId: STATE_CANCELLED.id, cycleId: "c2", estimate: 2 }),
  ];
}

/** Unscoped open issues on the same team: the backlog drawer's population. */
export function backlogIssues() {
  return [
    issueFixture({ id: "iss9", identifier: "PRO-9", title: "Unscoped work", stateId: STATE_TODO.id, cycleId: null, estimate: 5 }),
  ];
}

export interface CycleMock {
  fetchMock: Mock;
  sent: Array<{ key: string; body: unknown }>;
  issueCalls: string[];
}

type RouteMap = Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>;

/**
 * The issues route answers by filter: a `cycle eq` query gets the scoped set,
 * anything else gets the team's open issues.
 *
 * That second response deliberately mixes scoped rows in with the unscoped
 * one, because that is what the server really returns: the filter DSL has no
 * is-null predicate, so the backlog query cannot ask for "unscoped" and the
 * client has to drop the scoped rows itself. Returning only unscoped rows here
 * would make the drawer look correct with that filter deleted.
 */
export function mockCycleRoutes(extra: RouteMap = {}, cycles: CycleDto[] = [cycleFixture()]): CycleMock {
  const sent: Array<{ key: string; body: unknown }> = [];
  const issueCalls: string[] = [];

  const base: RouteMap = {
    "GET /api/auth/me": DEMO_ME,
    "GET /api/teams": { data: [CYCLE_TEAM] },
    "GET /api/teams/t1/states": { data: [STATE_TODO, STATE_PROG, STATE_DONE, STATE_CANCELLED] },
    "GET /api/teams/t2/states": { data: [] },
    "GET /api/labels": { data: [] },
    "GET /api/workspaces/ws1/members": { data: [{ userId: "u1", name: "Demo User" }] },
    "GET /api/views": { data: [], nextCursor: null },
    "GET /api/cycles": { data: cycles, nextCursor: null },
  };

  const routes: RouteMap = { ...base, ...extra };

  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const pathOnly = path.split("?")[0] ?? path;

    if (method !== "GET") {
      sent.push({ key: `${method} ${pathOnly}`, body: JSON.parse(String(init?.body ?? "null")) });
    }

    if (pathOnly === "/api/issues" && method === "GET") {
      issueCalls.push(path);
      const scoped = decodeURIComponent(path).includes('"cycle"');
      return Promise.resolve(
        jsonResponse(200, {
          data: scoped ? scopedIssues() : [...backlogIssues(), ...scopedIssues()],
          nextCursor: null,
        }),
      );
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
  return { fetchMock: impl, sent, issueCalls };
}

/** Reach R-20 the way a person does, through the sidebar link T-006 made live. */
export async function gotoCurrentCycle(): Promise<void> {
  await clickCurrentCycleLink();
  // Assert arrival rather than assuming it. The router is module state shared
  // by every test in the process, so a navigation that silently fails would
  // otherwise surface later as a confusing missing-element error on whatever
  // screen the previous test happened to leave behind.
  await waitFor(() => expect(window.location.pathname).toBe("/cycle/current"));
}

/** Reach R-20 by clicking the sidebar link, which T-006 made live. */
export async function clickCurrentCycleLink(): Promise<void> {
  const navs = await screen.findAllByRole("navigation", { name: "Workspace sections" });
  fireEvent.click(within(navs[0] as HTMLElement).getByRole("link", { name: "Current cycle" }));
}

/**
 * Undo everything a Radix modal does to the document outside its own tree.
 *
 * An open modal sets `aria-hidden` on its siblings, locks body scroll, and
 * plants focus-guard spans as direct children of `body`. Those live outside
 * the React root, so unmounting a tree mid-dialog strands them, and the next
 * render inherits a document that reports the whole shell as hidden. Roles
 * resolve against the accessibility tree, so every query then fails on a page
 * that plainly has the element.
 *
 * The app never reaches this state on its own: it always closes a dialog
 * through Radix, which reverses all of it. Only a test harness tearing down a
 * root mid-dialog gets here, so this is harness hygiene, not a product fix.
 */
export function resetOverlayArtifacts(): void {
  for (const guard of Array.from(document.querySelectorAll("[data-radix-focus-guard]"))) {
    guard.remove();
  }
  for (const node of Array.from(document.querySelectorAll("[data-aria-hidden]"))) {
    node.removeAttribute("aria-hidden");
    node.removeAttribute("data-aria-hidden");
  }
  document.body.removeAttribute("data-scroll-locked");
  document.body.style.pointerEvents = "";
}
