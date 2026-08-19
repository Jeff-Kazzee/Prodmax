import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { defaultIssueRoutes, issueFixture, mockFetchPrefix } from "../issues/helpers";

installResizeObserver();

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("triage keymap", () => {
  it("accepts the focused row with 1", async () => {
    const patches: unknown[] = [];
    mockFetchPrefix({
      ...defaultIssueRoutes([
        issueFixture({ stateId: "st-triage", title: "Inbound crash", identifier: "PRO-150", id: "iss-t" }),
      ]),
      "GET /api/issues/PRO-150": { issue: issueFixture({ stateId: "st-triage", identifier: "PRO-150", id: "iss-t" }) },
      "PATCH /api/issues/iss-t": (_url: string, init?: RequestInit) => {
        patches.push(JSON.parse(String(init?.body ?? "{}")));
        return { issue: issueFixture({ id: "iss-t", identifier: "PRO-150", stateId: "st-todo" }) };
      },
    });
    render(<App />);
    await screen.findAllByRole("navigation", { name: "Workspace sections" });
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "t" });
    expect(await screen.findByRole("heading", { name: "Triage" })).toBeInTheDocument();
    expect(await screen.findByText("Inbound crash")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "1" });
    await waitFor(() => expect(patches[0]).toEqual({ stateId: "st-todo" }));
  });
});
