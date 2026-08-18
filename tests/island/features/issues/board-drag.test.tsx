import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { defaultIssueRoutes, issueFixture, mockFetchPrefix, STATE_PROG } from "./helpers";

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

describe("board drag → PATCH payload", () => {
  it("PATCHes stateId when a card is dropped on another column", async () => {
    const issue = issueFixture();
    const fetchMock = mockFetchPrefix({
      ...defaultIssueRoutes([issue]),
      "PATCH /api/issues/iss1": (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { stateId?: string };
        return { issue: { ...issue, stateId: body.stateId ?? issue.stateId, version: 2 } };
      },
    });
    render(<App />);
    await openAllIssues();
    fireEvent.click(screen.getByRole("radio", { name: "board" }));

    const card = await screen.findByText("PRO-1");
    const target = await screen.findByRole("region", { name: "In Progress" });
    const article = card.closest("article");
    expect(article).toBeTruthy();

    const dt = {
      setData: () => undefined,
      getData: () => issue.id,
      effectAllowed: "move",
    };
    fireEvent.dragStart(article as HTMLElement, { dataTransfer: dt });
    fireEvent.dragOver(target);
    fireEvent.drop(target, { dataTransfer: dt });

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => {
        const url = String(c[0]);
        const method = (c[1] as RequestInit | undefined)?.method;
        return method === "PATCH" && url.includes("/api/issues/iss1");
      });
      expect(patch).toBeTruthy();
      expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
        stateId: STATE_PROG.id,
      });
    });
  });
});
