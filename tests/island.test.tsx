import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "@island/app";
import { DEMO_ME, jsonResponse, mockFetch } from "./shell/helpers";

// M0's placeholder home (wordmark + counter) was replaced by the M2 app
// shell; these two tests keep the same contract: the island mounts, and
// the shell replaces the placeholder surface.
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("island root", () => {
  it("redirects anonymous visitors to the login screen (AT-007)", async () => {
    mockFetch({
      "GET /api/auth/me": jsonResponse(401, {
        error: { code: "AUTH_REQUIRED", message: "Authentication required" },
      }),
    });
    window.history.replaceState(null, "", "/issues");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Sign in to your workshop" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(
      screen.getByRole("button", { name: /Continue|Signing in…/i }),
    ).toBeInTheDocument();
  });

  it("renders the app shell for a signed-in session", async () => {
    mockFetch({
      "GET /api/auth/me": DEMO_ME,
      "GET /api/teams?wsId=ws1": { data: [] },
    });

    render(<App />);

    // Sidebar: active workspace switcher shows the workspace name.
    expect(
      await screen.findByRole("button", { name: /Workspace: Acme Bench/i }),
    ).toBeInTheDocument();
    // Topbar: breadcrumb + search trigger + sync dot.
    expect(await screen.findByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Command palette (Ctrl K)" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Synced" })).toBeInTheDocument();
    // Content: the Home route renders the honest pending screen.
    expect(await screen.findByText("Still on the bench — this screen ships in an upcoming module.")).toBeInTheDocument();
  });
});
