/**
 * R-17 project list: status grouping, per-row cached progress, and the
 * status PATCH that moves a row between groups.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { gotoHome, gotoProjects, mockProjectRoutes, projectFixture } from "./helpers";

installResizeObserver();

afterEach(() => {
  // Unmount BEFORE unstubbing fetch. Vitest runs a file's after-hooks ahead of
  // the global one in tests/setup.ts, so without this the React tree is torn
  // down after `fetch` is real again, and any request in flight during unmount
  // escapes to the network. That also leaves Radix overlays half-torn-down,
  // which is what made these files depend on declaration order.
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const TWO_PROJECTS = [
  projectFixture(),
  projectFixture({
    id: "p2",
    name: "Onboarding revamp",
    status: "planned",
    progressCache: 29,
    progressPoints: { done: 2, total: 7, issuesDone: 3, issuesTotal: 10 },
  }),
];

describe("projects list", () => {
  it("groups by status and gives each row its own cached percent", async () => {
    mockProjectRoutes({ "GET /api/projects": { data: TWO_PROJECTS, nextCursor: null } });
    render(<App />);
    await gotoProjects();

    const started = await screen.findByRole("region", { name: "Started" });
    const planned = screen.getByRole("region", { name: "Planned" });
    expect(within(started).getByRole("link", { name: "Checkout rewrite" })).toBeInTheDocument();
    expect(within(planned).getByRole("link", { name: "Onboarding revamp" })).toBeInTheDocument();

    // Each bar reads its own row's cache. A shared or recomputed value would
    // make these two equal.
    expect(screen.getByRole("progressbar", { name: "Checkout rewrite progress" })).toHaveAttribute(
      "aria-valuenow",
      "62",
    );
    expect(screen.getByRole("progressbar", { name: "Onboarding revamp progress" })).toHaveAttribute(
      "aria-valuenow",
      "29",
    );
  });

  it("moves a row between groups through a real PATCH", async () => {
    let status = "started";
    const { sent } = mockProjectRoutes({
      "GET /api/projects": () => ({
        data: [projectFixture({ status: status as "started" }), TWO_PROJECTS[1]],
        nextCursor: null,
      }),
      "PATCH /api/projects/p1": (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
        status = body.status ?? status;
        return { project: projectFixture({ status: status as "started" }) };
      },
    });
    render(<App />);
    await gotoProjects();

    const select = await screen.findByRole("combobox", { name: "Status of Checkout rewrite" });
    fireEvent.change(select, { target: { value: "completed" } });

    await waitFor(() =>
      expect(sent.find((s) => s.key === "PATCH /api/projects/p1")?.body).toEqual({
        status: "completed",
      }),
    );
    // The list re-reads, so the row must land under its new heading rather
    // than staying put in a group computed once at first render.
    const completed = await screen.findByRole("region", { name: "Completed" });
    expect(within(completed).getByRole("link", { name: "Checkout rewrite" })).toBeInTheDocument();
  });

  it("ships no reorder affordance, because the PATCH has no position field", async () => {
    mockProjectRoutes({ "GET /api/projects": { data: TWO_PROJECTS, nextCursor: null } });
    render(<App />);
    await gotoProjects();
    const row = await screen.findByRole("link", { name: "Checkout rewrite" });

    // T-028 tracks the API gap. A drag handle here would persist nowhere,
    // which AGENTS.md forbids.
    //
    // The previous version of this test asserted that no PATCH was recorded
    // without touching anything, which no implementation could fail. These
    // assertions are about markup that would actually exist if a drag were
    // added: a real handle is a draggable node or a grip button, and neither
    // is named "reorder" often enough to catch by accessible name alone.
    const listItem = row.closest("li");
    expect(listItem).not.toBeNull();
    expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    expect(listItem?.getAttribute("draggable")).toBeNull();
    expect(screen.queryByRole("button", { name: /reorder|drag|move up|move down/i })).toBeNull();
  });

  it("offers the empty state when the workspace has no projects", async () => {
    mockProjectRoutes({ "GET /api/projects": { data: [], nextCursor: null } });
    render(<App />);
    await gotoHome();
    await gotoProjects();

    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });
});
