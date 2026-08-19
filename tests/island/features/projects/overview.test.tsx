/**
 * S-15 acceptance: the overview renders the materialized progress cache and
 * scans no issues to do it (architecture §9).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { gotoHome, gotoProject, mockProjectRoutes, projectFixture } from "./helpers";

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

describe("project overview renders cached progress", () => {
  it("shows the stored percent, not one derived from issues", async () => {
    const { issueCalls } = mockProjectRoutes();
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();

    const bar = await screen.findByRole("progressbar", { name: "Project progress" });
    // 62 is the stored cache. The mocked issue list is 31 of 31 complete, so a
    // scan would say 100, and the points pair 41/78 would say 53.
    expect(bar).toHaveAttribute("aria-valuenow", "62");
    expect(screen.getByTestId("pj-progress-label")).toHaveTextContent(
      "62% · 12/31 issues · 41/78 pts",
    );
    expect(issueCalls).toEqual([]);
  });

  it("issues no /api/issues request while the overview is open, and the recorder is live", async () => {
    const { issueCalls } = mockProjectRoutes();
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();

    await screen.findByRole("progressbar", { name: "Project progress" });
    expect(issueCalls).toEqual([]);

    // The sensor check. Without it the assertion above would also pass against
    // a recorder wired to a route the app can never reach, which would make it
    // prove nothing at all.
    fireEvent.click(screen.getByRole("link", { name: /^Issues/ }));
    await waitFor(() => expect(issueCalls.length).toBeGreaterThan(0));
  });

  it("says counts are unavailable rather than 0/0 when the cache is legacy", async () => {
    // The shape scripts/seed.ts writes today: parseProgressPoints rejects the
    // two-field cache, so the server sends progressPoints: null (T-025).
    const { issueCalls } = mockProjectRoutes({
      "GET /api/projects/p1": {
        project: projectFixture({ progressCache: 14, progressPoints: null }),
      },
    });
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();

    const bar = await screen.findByRole("progressbar", { name: "Project progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "14");
    expect(screen.getByTestId("pj-progress-label")).toHaveTextContent("14% · counts unavailable");
    expect(screen.queryByText(/0\/0 issues/)).toBeNull();
    expect(issueCalls).toEqual([]);
  });

  it("marks the bar overdue only when the target has passed and work remains", async () => {
    // design-system §43: an overdue bar switches its fill to danger. A
    // finished project past its target is done, not late, so the completed
    // case is what stops this being "any past date turns the bar red".
    const { issueCalls } = mockProjectRoutes({
      "GET /api/projects/p1": {
        project: projectFixture({ targetEndDate: "2020-01-01", progressCache: 62 }),
      },
    });
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();

    expect(await screen.findByRole("progressbar", { name: "Project progress" })).toHaveAttribute(
      "data-overdue",
      "true",
    );
  });

  it("does not mark a finished project overdue, however old its target", async () => {
    const { issueCalls } = mockProjectRoutes({
      "GET /api/projects/p1": {
        project: projectFixture({
          targetEndDate: "2020-01-01",
          progressCache: 100,
          progressPoints: { done: 78, total: 78, issuesDone: 31, issuesTotal: 31 },
        }),
      },
    });
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();

    expect(await screen.findByRole("progressbar", { name: "Project progress" })).not.toHaveAttribute(
      "data-overdue",
    );
  });

  it("does not claim a deletion for an id the workspace cannot see", async () => {
    // A fresh Response per call: a body can only be read once, and this route
    // is hit again whenever the issue bus fires.
    const { issueCalls } = mockProjectRoutes({
      "GET /api/projects/p1": () =>
        new Response(
          JSON.stringify({ error: { code: "NOT_FOUND", message: "Project not found" } }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
    });
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();

    // NOT_FOUND covers a trashed project and a cross-workspace one alike, so
    // the copy must not pick one. A user pasting a colleague's link is in the
    // wrong workspace, not looking at something deleted.
    expect(
      await screen.findByText("This project is not in this workspace."),
    ).toBeInTheDocument();
  });
});
