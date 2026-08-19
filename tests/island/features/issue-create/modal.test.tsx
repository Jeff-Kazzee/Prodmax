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

async function landInShell(): Promise<void> {
  const navs = await screen.findAllByRole("navigation", { name: "Workspace sections" });
  expect(navs.length).toBeGreaterThan(0);
}

describe("new-issue modal", () => {
  it("creates from C, keeps the dialog on create-another, restores a draft", async () => {
    const created: string[] = [];
    mockFetchPrefix({
      ...defaultIssueRoutes(),
      "POST /api/issues": (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { title: string };
        created.push(body.title);
        return {
          issue: issueFixture({ id: `iss-${created.length}`, identifier: `PRO-${created.length + 1}`, title: body.title }),
          suggestions: [],
        };
      },
    });
    render(<App />);
    await landInShell();

    fireEvent.keyDown(window, { key: "c" });
    const title = await screen.findByLabelText("Issue title");
    fireEvent.change(title, { target: { value: "First ship" } });
    fireEvent.click(screen.getByLabelText("Create another"));
    fireEvent.click(screen.getByRole("button", { name: "Create issue" }));
    await waitFor(() => expect(created).toEqual(["First ship"]));
    expect(screen.getByRole("dialog", { name: "New issue" })).toBeInTheDocument();
    expect((screen.getByLabelText("Issue title") as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByLabelText("Issue title"), { target: { value: "Draft me" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New issue" })).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "c" });
    expect(await screen.findByRole("dialog", { name: "New issue" })).toBeInTheDocument();
    await waitFor(() => {
      expect((screen.getByLabelText("Issue title") as HTMLInputElement).value).toBe("Draft me");
    });
  });
});
