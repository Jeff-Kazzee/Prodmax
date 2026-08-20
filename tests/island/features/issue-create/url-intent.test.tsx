/**
 * T-033. `?team=` is a screen's parameter, not a request to create an issue.
 *
 * `IssueCreateHost` is mounted by the shell, so its URL effect applies to every
 * route. It used to open the create modal whenever `title`, `priority` or
 * `team` appeared in the query string, and ux-spec hands `?team=` to triage
 * (§4.14) and to the cycle header (§4.16 CY-01). So a shared link to a
 * team-scoped screen opened a create form over the screen, and a modal marks
 * the rest of the document `aria-hidden`, which removes the page the reader
 * asked for from the accessibility tree rather than merely covering it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@island/app";
import { installResizeObserver } from "../../../shell/helpers";
import { defaultIssueRoutes, mockFetchPrefix } from "../issues/helpers";

installResizeObserver();

afterEach(() => {
  // Return the router to "/" while the tree is still mounted, so the next test
  // does not mount on the previous one's query string. The router is module
  // state built once in app.tsx and only reacts to popstate, so a pushState
  // after unmount would never reach it. This hook runs before the cleanup in
  // tests/setup.ts, which is why the unmount below is explicit.
  window.history.pushState(null, "", "/");
  fireEvent.popState(window);
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function shellReady(): Promise<HTMLElement> {
  const navs = await screen.findAllByRole("navigation", { name: "Workspace sections" });
  return navs[0] as HTMLElement;
}

/**
 * Dismiss a modal before the test ends. Radix marks the rest of the document
 * aria-hidden while one is open, and unmounting through that leaves the next
 * test's shell unqueryable by role.
 */
async function closeDialog(): Promise<void> {
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "New issue" })).toBeNull());
}

/** Navigate in-app: the router is built once at module scope in app.tsx. */
async function goto(linkName: string): Promise<void> {
  fireEvent.click(within(await shellReady()).getByRole("link", { name: linkName }));
}

describe("opening the create modal from the URL", () => {
  it("leaves triage alone when the team switcher writes ?team=", async () => {
    mockFetchPrefix(defaultIssueRoutes());
    render(<App />);
    await goto("Triage");
    await screen.findByRole("heading", { name: "Triage" });

    // The triage team switcher writes this, and so does a shared triage link.
    window.history.pushState(null, "", "/triage?team=PRO");
    fireEvent.popState(window);

    await waitFor(() => expect(window.location.search).toBe("?team=PRO"));
    expect(screen.queryByRole("dialog", { name: "New issue" })).toBeNull();
    // The shell must still be reachable, which it is not while a modal holds
    // the rest of the document aria-hidden.
    expect(within(await shellReady()).getByRole("link", { name: "Triage" })).toBeInTheDocument();
  });

  it("still opens on an explicit ?new, carrying its prefill", async () => {
    // Without this the assertion above would pass against a host that never
    // opens the modal from a URL at all.
    mockFetchPrefix(defaultIssueRoutes());
    render(<App />);
    await shellReady();

    window.history.pushState(null, "", "/issues?new=1&title=From%20a%20link&team=PRO");
    fireEvent.popState(window);

    const dialog = await screen.findByRole("dialog", { name: "New issue" });
    expect(within(dialog).getByLabelText("Issue title")).toHaveValue("From a link");
    await closeDialog();
  });

  it("opens on the R-15 route and keeps its documented prefill", async () => {
    // ux-spec §2.2 R-15: /team/:teamKey/new is the shareable create link, with
    // ?title= and ?priority= as prefill. The route is the intent.
    mockFetchPrefix(defaultIssueRoutes());
    render(<App />);
    await shellReady();

    window.history.pushState(null, "", "/team/PRO/new?title=Routed%20in");
    fireEvent.popState(window);

    const dialog = await screen.findByRole("dialog", { name: "New issue" });
    expect(within(dialog).getByLabelText("Issue title")).toHaveValue("Routed in");
    await closeDialog();
  });
});
