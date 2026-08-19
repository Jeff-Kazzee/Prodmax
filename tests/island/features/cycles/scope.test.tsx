/**
 * CY-01/CY-03 cycle resolution and scoping.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { OTHER_TEAM, cycleFixture, gotoCurrentCycle, mockCycleRoutes } from "./helpers";

installResizeObserver();

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const SCOPE_RESPONSE = {
  cycle: cycleFixture({ stats: { scope: { issues: 7, points: 19 }, completed: { issues: 2, points: 4 } } }),
  scope: { issues: 7, points: 19 },
};

describe("cycle scoping", () => {
  it("asks for cycles with a cycles-enabled team id", async () => {
    const { fetchMock } = mockCycleRoutes({
      // The first team has cycles off, so picking "the first team" blindly
      // would query a team that has none.
      "GET /api/teams": { data: [{ ...OTHER_TEAM, position: "a" }, { ...OTHER_TEAM, id: "t1", key: "PRO", position: "b", cyclesEnabled: 1 }] },
    });
    render(<App />);
    await gotoCurrentCycle();

    await waitFor(() => {
      const cycleCall = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .find((u) => u.startsWith("/api/cycles?"));
      // Omitting teamId is a 400 from this endpoint, not an all-teams list.
      expect(cycleCall).toContain("teamId=t1");
    });
  });

  it("adds a backlog issue through the scope endpoint", async () => {
    const { sent } = mockCycleRoutes({ "POST /api/cycles/c2/scope": SCOPE_RESPONSE });
    render(<App />);
    await gotoCurrentCycle();

    const add = await screen.findByRole("button", { name: "Add PRO-9 to cycle" });
    fireEvent.click(add);

    await waitFor(() =>
      // Ids, not identifiers: the service rejects identifiers as offending ids.
      expect(sent.find((s) => s.key === "POST /api/cycles/c2/scope")?.body).toEqual({
        add: ["iss9"],
      }),
    );
  });

  it("removes a scoped issue through the same endpoint", async () => {
    const { sent } = mockCycleRoutes({ "POST /api/cycles/c2/scope": SCOPE_RESPONSE });
    render(<App />);
    await gotoCurrentCycle();

    fireEvent.click(await screen.findByRole("button", { name: "Remove PRO-1 from cycle" }));

    await waitFor(() =>
      // Add and remove must not share a handler: the service applies remove
      // first, so a swap silently no-ops instead of erroring.
      expect(sent.find((s) => s.key === "POST /api/cycles/c2/scope")?.body).toEqual({
        remove: ["iss1"],
      }),
    );
  });

  it("shows the server's scope count, not the length of the visible list", async () => {
    // The stats deliberately disagree with the rendered rows: the server says
    // 9 issues while the mocked page returns 6. A screen that counted rows
    // would print 6 here, which is the natural wrong implementation and the
    // real case too, since the list is one page and the count is the cycle.
    mockCycleRoutes({}, [
      cycleFixture({ stats: { scope: { issues: 9, points: 21 }, completed: { issues: 2, points: 4 } } }),
    ]);
    render(<App />);
    await gotoCurrentCycle();

    expect(await screen.findByTestId("cy-scope-stat")).toHaveTextContent("9 issues · 21 pts");
    expect(screen.getAllByRole("button", { name: /Remove PRO-\d+ from cycle/ })).toHaveLength(6);
  });

  it("keeps the backlog to unscoped issues only", async () => {
    mockCycleRoutes();
    render(<App />);
    await gotoCurrentCycle();

    // PRO-9 has cycleId null, PRO-1 is already scoped. The filter DSL cannot
    // express "is null", so this separation is a client-side pass and it is
    // worth pinning.
    expect(await screen.findByRole("button", { name: "Add PRO-9 to cycle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add PRO-1 to cycle" })).toBeNull();
  });

  it("offers the CY-10 empty state when no team has cycles enabled", async () => {
    mockCycleRoutes({ "GET /api/teams": { data: [OTHER_TEAM] } });
    render(<App />);
    await gotoCurrentCycle();

    expect(await screen.findByText("No active cycle")).toBeInTheDocument();
  });
});
