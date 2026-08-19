/**
 * PJ-05 update posting: the composer sends what the picker says, the feed
 * re-reads, and the header health chip follows the newest update.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { gotoHome, gotoProject, mockProjectRoutes, updateFixture } from "./helpers";

installResizeObserver();

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** The updates route answers empty until a POST lands, then answers with it. */
function updatesRoutes() {
  let posted = false;
  return {
    "GET /api/projects/p1/updates": () => ({
      data: posted
        ? [updateFixture({ health: "at_risk", bodyMd: "Gateway rotation slipped" })]
        : [],
      nextCursor: null,
    }),
    "POST /api/projects/p1/updates": () => {
      posted = true;
      return { update: updateFixture({ health: "at_risk", bodyMd: "Gateway rotation slipped" }) };
    },
  };
}

async function openUpdatesTab(): Promise<void> {
  fireEvent.click(await screen.findByRole("link", { name: /^Updates/ }));
  await screen.findByRole("button", { name: "Post update" });
}

describe("project updates", () => {
  it("refuses to post an empty body", async () => {
    const { issueCalls } = mockProjectRoutes(updatesRoutes());
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();
    await openUpdatesTab();

    // The server rejects an empty bodyMd with a 400, so the button must not
    // let the request leave in the first place.
    expect(screen.getByRole("button", { name: "Post update" })).toBeDisabled();
  });

  it("posts the health the picker shows, then re-reads the feed and the header", async () => {
    const { issueCalls, sent } = mockProjectRoutes(updatesRoutes());
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();

    // Before anything is posted the header says so, rather than guessing.
    expect(await screen.findByTestId("pj-health-chip")).toHaveTextContent("No update yet");

    await openUpdatesTab();
    fireEvent.change(screen.getByRole("combobox", { name: "Health" }), {
      target: { value: "at_risk" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Update body" }), {
      target: { value: "Gateway rotation slipped" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post update" }));

    await waitFor(() =>
      expect(sent.find((s) => s.key === "POST /api/projects/p1/updates")?.body).toEqual({
        health: "at_risk",
        bodyMd: "Gateway rotation slipped",
      }),
    );

    // The feed answered [] on the first read, so this text can only be on
    // screen if the composer refetched after the POST.
    expect(await screen.findByText("Gateway rotation slipped")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("pj-health-chip")).toHaveTextContent("At risk"),
    );

    // Posting an update is not an issue write, so it must not scan issues.
    expect(issueCalls).toEqual([]);
  });

  it("omits progressSnapshot so the server snapshots its own cache", async () => {
    const { issueCalls, sent } = mockProjectRoutes(updatesRoutes());
    render(<App />);
    await gotoHome();
    issueCalls.length = 0;
    await gotoProject();
    await openUpdatesTab();

    fireEvent.change(screen.getByRole("textbox", { name: "Update body" }), {
      target: { value: "Steady" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post update" }));

    await waitFor(() => expect(sent.some((s) => s.key === "POST /api/projects/p1/updates")).toBe(true));
    const body = sent.find((s) => s.key === "POST /api/projects/p1/updates")?.body as
      | Record<string, unknown>
      | undefined;
    // A client-computed snapshot could disagree with progress_cache, which is
    // the number the update is a report about.
    expect(body).not.toHaveProperty("progressSnapshot");
  });
});
