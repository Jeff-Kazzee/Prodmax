import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { defaultIssueRoutes, issueFixture, mockFetchPrefix } from "./helpers";

installResizeObserver();

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function openAllIssues(): Promise<void> {
  const navs = await screen.findAllByRole("navigation", { name: "Workspace sections" });
  const link = within(navs[0] as HTMLElement).getByRole("link", { name: "All issues" });
  fireEvent.click(link);
  expect(await screen.findByRole("heading", { name: "All issues" })).toBeInTheDocument();
}

describe("issue list selection + collapse", () => {
  it("toggles row selection and shows the bulk bar", async () => {
    mockFetchPrefix(
      defaultIssueRoutes([
        issueFixture(),
        issueFixture({ id: "iss2", identifier: "PRO-2", title: "Other" }),
      ]),
    );
    render(<App />);
    await openAllIssues();

    const box = await screen.findByRole("checkbox", { name: "Select PRO-1" });
    fireEvent.click(box);
    expect(await screen.findByRole("toolbar", { name: "Bulk actions" })).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("persists group collapse across a remount", async () => {
    mockFetchPrefix(defaultIssueRoutes());
    const { unmount } = render(<App />);
    await openAllIssues();
    const toggle = await screen.findByRole("button", { name: /Collapse All issues/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    unmount();
    mockFetchPrefix(defaultIssueRoutes());
    render(<App />);
    await openAllIssues();
    const again = await screen.findByRole("button", { name: /Expand All issues/i });
    expect(again).toHaveAttribute("aria-expanded", "false");
  });
});
