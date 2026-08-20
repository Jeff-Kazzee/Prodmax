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

  it("reorders within a status group by writing a midpoint key", async () => {
    // T-028 gave the PATCH a position, so the drag is real now. The guard that
    // used to sit here asserted no PATCH was sent in a test that clicked
    // nothing, which no implementation could fail.
    const THREE = [
      projectFixture({ id: "p1", name: "Alpha", status: "started", position: "a0" }),
      projectFixture({ id: "p2", name: "Beta", status: "started", position: "a1" }),
      projectFixture({ id: "p3", name: "Gamma", status: "started", position: "a2" }),
    ];
    const { sent } = mockProjectRoutes({
      "GET /api/projects": { data: THREE, nextCursor: null },
      "PATCH /api/projects/p3": { project: THREE[2] },
    });
    render(<App />);
    await gotoProjects();
    await screen.findByRole("link", { name: "Alpha" });

    const gamma = document.querySelector('[data-project-id="p3"]') as HTMLElement;
    const beta = document.querySelector('[data-project-id="p2"]') as HTMLElement;
    const transfer = { data: {} as Record<string, string>, effectAllowed: "", setData(k: string, v: string) { this.data[k] = v; }, getData(k: string) { return this.data[k] ?? ""; } };

    fireEvent.dragStart(gamma, { dataTransfer: transfer });
    fireEvent.drop(beta, { dataTransfer: transfer });

    await waitFor(() =>
      expect(sent.find((x) => x.key === "PATCH /api/projects/p3")).toBeDefined(),
    );
    const body = sent.find((x) => x.key === "PATCH /api/projects/p3")?.body as { position?: string };
    // Dropped onto Beta, so Gamma lands between Alpha ("a0") and Beta ("a1").
    // Asserting the bounds rather than a literal keeps this about ordering
    // rather than about generateKeyBetween's exact output.
    expect(body.position).toBeDefined();
    expect(body.position! > "a0").toBe(true);
    expect(body.position! < "a1").toBe(true);
  });

  it("refuses to reorder across status groups", async () => {
    // Position and status are separate facts. Inferring a status change from a
    // drop would make one gesture mean two things, and the row already has a
    // status select.
    const { sent } = mockProjectRoutes({
      "GET /api/projects": { data: TWO_PROJECTS, nextCursor: null },
    });
    render(<App />);
    await gotoProjects();
    await screen.findByRole("link", { name: "Checkout rewrite" });

    const started = document.querySelector('[data-project-id="p1"]') as HTMLElement;
    const planned = document.querySelector('[data-project-id="p2"]') as HTMLElement;
    const transfer = { data: {} as Record<string, string>, effectAllowed: "", setData(k: string, v: string) { this.data[k] = v; }, getData(k: string) { return this.data[k] ?? ""; } };

    fireEvent.dragStart(started, { dataTransfer: transfer });
    fireEvent.drop(planned, { dataTransfer: transfer });

    await new Promise((r) => setTimeout(r, 30));
    expect(sent.filter((x) => x.key.startsWith("PATCH /api/projects"))).toEqual([]);
  });

  it("offers the empty state when the workspace has no projects", async () => {
    mockProjectRoutes({ "GET /api/projects": { data: [], nextCursor: null } });
    render(<App />);
    await gotoHome();
    await gotoProjects();

    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });
});
