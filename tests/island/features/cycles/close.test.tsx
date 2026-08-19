/**
 * CY-06/CY-08 close flow: the preview applies the server's own rollover rule,
 * and the receipt reports the server's count rather than the preview's.
 *
 * Every test unmounts its own render. `createBrowserRouter` and the window
 * keyboard layer are process-wide, so a root that outlives its test keeps a
 * listener attached and can portal an overlay into the next one, which then
 * marks the fresh shell aria-hidden and hides it from role queries.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import {
  resetOverlayArtifacts,
  cycleFixture,
  gotoCurrentCycle,
  mockCycleRoutes,
} from "./helpers";

installResizeObserver();

afterEach(() => {
  // Unmount BEFORE unstubbing fetch. Vitest runs a file's after-hooks ahead of
  // the global one in tests/setup.ts, so without this the React tree is torn
  // down after `fetch` is real again, and any request in flight during unmount
  // escapes to the network. That also leaves Radix overlays half-torn-down,
  // which is what made these files depend on declaration order.
  cleanup();
  resetOverlayArtifacts();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const COMPLETED_C1 = cycleFixture({
  id: "c1",
  number: 1,
  name: "Cycle 1",
  status: "completed",
  startsAt: 1_699_000_000_000,
  endsAt: 1_699_000_000_000 + 14 * 86_400_000,
  closedAt: 1_699_500_000_000,
  stats: { scope: { issues: 4, points: 9 }, completed: { issues: 4, points: 9 } },
});

async function openCloseDialog(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Close cycle" }));
  await screen.findByTestId("cy-rollover-preview");
}

/**
 * Dismiss the dialog before the test ends.
 *
 * Unmounting a React root while a Radix modal is open strands its
 * `aria-hidden` marker and the body scroll lock on nodes that outlive the
 * tree, and the next test's fresh shell inherits them. That made this file
 * pass only in declaration order. The app itself never does this: it always
 * unmounts the dialog through its own close path.
 */
async function dismissDialog(): Promise<void> {
  const cancel = screen.queryByRole("button", { name: "Cancel" });
  if (cancel) {
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByTestId("cy-rollover-preview")).toBeNull());
  }
}

describe("close cycle", () => {
  it("previews only the issues the server would roll", async () => {
    mockCycleRoutes();
    const view = render(<App />);
    await gotoCurrentCycle();
    await openCloseDialog();

    // The scoped set is 3 open, 2 completed, 1 canceled. Ignoring state
    // category reads 6, and excluding only completed reads 4. The server's rule,
    // category not in (completed, canceled), reads 3.
    expect(screen.getByTestId("cy-rollover-preview")).toHaveTextContent(
      "3 of 6 scoped issues would roll over, as of now.",
    );
    await dismissDialog();
    view.unmount();
  });

  it("names the destination cycle from the loaded list", async () => {
    mockCycleRoutes({}, [
      cycleFixture(),
      cycleFixture({
        id: "c3",
        number: 3,
        name: "Cycle 3",
        status: "future",
        startsAt: 1_700_000_000_000 + 14 * 86_400_000,
        endsAt: 1_700_000_000_000 + 28 * 86_400_000,
      }),
    ]);
    const view = render(<App />);
    await gotoCurrentCycle();
    await openCloseDialog();

    // The server picks the earliest non-completed cycle starting at or after
    // this one ends, so the dialog must name that one and not invent a number.
    expect(screen.getByTestId("cy-rollover-target")).toHaveTextContent("Destination: Cycle 3.");
    await dismissDialog();
    view.unmount();
  });

  it("says a cycle will be created when no later one exists", async () => {
    mockCycleRoutes();
    const view = render(<App />);
    await gotoCurrentCycle();
    await openCloseDialog();

    expect(screen.getByTestId("cy-rollover-target")).toHaveTextContent(
      "No later cycle exists yet, so one will be created.",
    );
    await dismissDialog();
    view.unmount();
  });

  it("surfaces a 409 instead of swallowing it", async () => {
    mockCycleRoutes({
      "POST /api/cycles/c2/close": () =>
        new Response(
          JSON.stringify({ error: { code: "CONFLICT", message: "Cycle is already closed" } }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    });
    const view = render(<App />);
    await gotoCurrentCycle();
    await openCloseDialog();

    fireEvent.click(screen.getByRole("button", { name: "Close cycle" }));
    expect(await screen.findByText("Cycle is already closed")).toBeInTheDocument();
    await dismissDialog();
    view.unmount();
  });

  it("freezes a completed cycle: as-of caption, no close control", async () => {
    // R-21 is reached through the history nav, which is how a person gets to a
    // closed cycle: /cycle/current can never show one, because a completed
    // cycle is neither active nor upcoming.
    mockCycleRoutes({}, [COMPLETED_C1, cycleFixture()]);
    const view = render(<App />);
    await gotoCurrentCycle();

    fireEvent.click(await screen.findByRole("link", { name: "Cycle 1" }));

    // A second close is a 409, so the control must not be offered at all.
    expect(await screen.findByTestId("cy-asof")).toHaveTextContent("as of close");
    expect(screen.queryByRole("button", { name: "Close cycle" })).toBeNull();
    view.unmount();
  });

  it("counts the denominator from the server, and flags a partial preview", async () => {
    // The server says 9 scoped; the mocked page returns 6. Printing the page
    // length as "of N scoped issues" states a size the client cannot know, so
    // the denominator is the server's and the shortfall is called out.
    mockCycleRoutes({}, [
      cycleFixture({ stats: { scope: { issues: 9, points: 21 }, completed: { issues: 2, points: 4 } } }),
    ]);
    const view = render(<App />);
    await gotoCurrentCycle();
    await openCloseDialog();

    expect(screen.getByTestId("cy-rollover-preview")).toHaveTextContent(
      "At least 3 of 9 scoped issues would roll over, as of now.",
    );
    expect(screen.getByTestId("cy-rollover-partial")).toHaveTextContent(
      "The preview counted the 6 issues loaded here",
    );
    await dismissDialog();
    view.unmount();
  });

  it("says nothing about drift when the server agrees with the preview", async () => {
    // Without this, always printing "preview said N" would pass every other
    // close test in this file.
    const { sent } = mockCycleRoutes({
      "POST /api/cycles/c2/close": {
        cycle: cycleFixture({ status: "completed", closedAt: 1_700_500_000_000 }),
        rollover: { count: 3, nextCycleId: "c3", nextCycleCreated: false },
      },
    });
    const view = render(<App />);
    await gotoCurrentCycle();
    await openCloseDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close cycle" }));

    await waitFor(() => expect(sent.some((s) => s.key === "POST /api/cycles/c2/close")).toBe(true));
    expect(await screen.findByText(/3 issues rolled over/)).toBeInTheDocument();
    expect(screen.queryByText(/preview said/)).toBeNull();
    view.unmount();
  });

  it("reports the server's rollover count, and names the drift from the preview", async () => {
    const { sent } = mockCycleRoutes({
      "POST /api/cycles/c2/close": {
        cycle: cycleFixture({ status: "completed", closedAt: 1_700_500_000_000 }),
        // The server moved 5. The preview said 3, because the client was
        // looking at a snapshot someone else has since changed.
        rollover: { count: 5, nextCycleId: "c3", nextCycleCreated: true },
      },
    });
    const view = render(<App />);
    await gotoCurrentCycle();
    await openCloseDialog();

    expect(screen.getByTestId("cy-rollover-preview")).toHaveTextContent("3 of 6");
    fireEvent.click(screen.getByRole("button", { name: "Close cycle" }));

    await waitFor(() => expect(sent.some((s) => s.key === "POST /api/cycles/c2/close")).toBe(true));
    // The preview never gets the last word about what actually happened.
    expect(await screen.findByText(/5 issues rolled over/)).toBeInTheDocument();
    expect(screen.getByText(/preview said 3/)).toBeInTheDocument();
    view.unmount();
  });
});
