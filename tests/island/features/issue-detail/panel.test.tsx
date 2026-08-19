import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { jsonResponse } from "../../../shell/helpers";
import { commentFixture, defaultIssueRoutes, mockFetchPrefix } from "../issues/helpers";

installResizeObserver();

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function openAllIssues(): Promise<void> {
  const navs = await screen.findAllByRole("navigation", { name: "Workspace sections" });
  fireEvent.click(within(navs[0] as HTMLElement).getByRole("link", { name: "All issues" }));
  expect(await screen.findByRole("heading", { name: "All issues" })).toBeInTheDocument();
}

async function openPanel(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole("link", { name: "PRO-1" }));
  return screen.findByRole("complementary", { name: "Issue details" });
}

describe("issue panel", () => {
  it("opens from a row, restores focus on Esc", async () => {
    mockFetchPrefix(defaultIssueRoutes());
    render(<App />);
    await openAllIssues();
    const idLink = await screen.findByRole("link", { name: "PRO-1" });
    fireEvent.click(idLink);
    const panel = await screen.findByRole("complementary", { name: "Issue details" });
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Issue details" })).not.toBeInTheDocument();
    });
    const row = document.querySelector('[data-identifier="PRO-1"]');
    expect(row).toBeTruthy();
    expect(row === document.activeElement || row?.contains(document.activeElement)).toBe(true);
  });

  it("lazy-fetches comments on first tab visit", async () => {
    const comments = vi.fn(() => ({ data: [commentFixture()] }));
    mockFetchPrefix({
      ...defaultIssueRoutes(),
      "GET /api/issues/PRO-1/comments": comments,
    });
    render(<App />);
    await openAllIssues();
    await openPanel();
    expect(comments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Comments" }));
    expect(await screen.findByText("Looks good")).toBeInTheDocument();
    expect(comments).toHaveBeenCalled();
  });

  it("rolls a failed priority PATCH back", async () => {
    mockFetchPrefix({
      ...defaultIssueRoutes(),
      "PATCH /api/issues/PRO-1": () =>
        jsonResponse(500, { error: { code: "INTERNAL", message: "write failed" } }),
    });
    render(<App />);
    await openAllIssues();
    const panel = await openPanel();
    const select = within(panel).getByLabelText("Priority") as HTMLSelectElement;
    expect(select.value).toBe("3");
    fireEvent.change(select, { target: { value: "1" } });
    await waitFor(() => expect(select.value).toBe("3"));
  });

  it("posts a comment with Cmd+Enter", async () => {
    mockFetchPrefix({
      ...defaultIssueRoutes(),
      "GET /api/issues/PRO-1/comments": { data: [] },
      "POST /api/issues/PRO-1/comments": (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { bodyMd: string };
        return { comment: commentFixture({ bodyMd: body.bodyMd }) };
      },
    });
    render(<App />);
    await openAllIssues();
    await openPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Comments" }));
    const composer = await screen.findByLabelText("Comment");
    fireEvent.change(composer, { target: { value: "Ship it" } });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    expect(await screen.findByText("Ship it")).toBeInTheDocument();
  });
});
