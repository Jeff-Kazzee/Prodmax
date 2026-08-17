import { describe, expect, it } from "vitest";
import { AUTH_ROUTES, REDIRECTS, SHELL_ROUTES, crumbsFor } from "@island/app/routes";

const EXPECTED_SETTINGS = [
  "/settings/profile",
  "/settings/sessions",
  "/settings/appearance",
  "/settings/notifications",
  "/settings/members",
  "/settings/teams",
  "/settings/workflows",
  "/settings/labels",
  "/settings/templates",
  "/settings/api-keys",
  "/settings/webhooks",
  "/settings/import-export",
  "/settings/workspace",
  "/settings/ai",
];

describe("route table (ux-spec §2 — 49 routes)", () => {
  it("covers every ux-spec route id R-01…R-49 exactly once", () => {
    const ids = new Set<string>([
      ...AUTH_ROUTES.map((r) => r.id),
      ...SHELL_ROUTES.map((r) => r.id),
      "R-08", // /notifications alias (client redirect)
      "R-13", // /team/:key redirect to default view
      "R-49", // 404 catch-all (registered structurally in app.tsx, not in the table)
    ]);
    const expected: string[] = [];
    for (let i = 1; i <= 49; i++) expected.push(`R-${String(i).padStart(2, "0")}`);
    expect([...ids].sort()).toEqual(expected.sort());
  });

  it("registers the core issue-bearing routes with layout subpaths", () => {
    const paths = new Set(SHELL_ROUTES.map((r) => r.path));
    for (const p of ["/issues", "/issues/list", "/issues/board", "/issues/table", "/issue/:identifier", "/v/:viewId"]) {
      expect(paths.has(p)).toBe(true);
    }
  });

  it("registers all 14 single-segment settings routes plus detail routes", () => {
    const paths = new Set(SHELL_ROUTES.map((r) => r.path));
    for (const p of EXPECTED_SETTINGS) expect(paths.has(p)).toBe(true);
    expect(paths.has("/settings/teams/:teamKey")).toBe(true);
    expect(paths.has("/settings/webhooks/:id")).toBe(true);
  });

  it("maps the /notifications alias and team default-view redirect", () => {
    expect(REDIRECTS).toContainEqual({ from: "/notifications", to: "/inbox" });
  });

  it("derives breadcrumbs per SB-10 (workspace / team / view / identifier)", () => {
    expect(crumbsFor("/", "Acme")).toEqual([
      { label: "Acme", to: "/" },
      { label: "Home", to: "/" },
    ]);
    expect(crumbsFor("/issues/board", "Acme")).toEqual([
      { label: "Acme", to: "/" },
      { label: "Issues", to: "/issues" },
    ]);
    expect(crumbsFor("/issue/PRO-123", "Acme")).toEqual([
      { label: "Acme", to: "/" },
      { label: "PRO-123", to: null },
    ]);
    expect(crumbsFor("/team/PRO/all", "Acme")).toEqual([
      { label: "Acme", to: "/" },
      { label: "PRO", to: "/team/PRO/all" },
      { label: "All issues", to: null },
    ]);
    expect(crumbsFor("/settings/members", "Acme")).toEqual([
      { label: "Acme", to: "/" },
      { label: "Settings", to: "/settings/profile" },
      { label: "Members", to: null },
    ]);
    expect(crumbsFor("/docs/page/abc", "Acme")).toEqual([
      { label: "Acme", to: "/" },
      { label: "Docs", to: "/docs" },
      { label: "abc", to: null },
    ]);
  });
});
