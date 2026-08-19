/**
 * S-15 acceptance: the overview renders the materialized progress cache and
 * scans no issues to do it (architecture §9).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { gotoHome, gotoProject, mockProjectRoutes, projectFixture } from "./helpers";

installResizeObserver();

afterEach(() => {
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

  it("renders the deleted-project state on a 404 rather than spinning", async () => {
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

    expect(await screen.findByText("This project was deleted.")).toBeInTheDocument();
  });
});
