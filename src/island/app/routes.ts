/**
 * M2 route table — all 49 routes from ux-spec §2 (R-01…R-49).
 * Screens owned by later modules render the shared honest pending screen;
 * the table drives router registration, breadcrumbs (SB-10) and tests.
 */

export interface PendingRoute {
  /** ux-spec route id (R-01…R-49). */
  id: string;
  path: string;
  /** Screen name per ux-spec §4 (breadcrumb tail + pending title). */
  screen: string;
}

export const AUTH_ROUTES: readonly PendingRoute[] = [
  { id: "R-01", path: "/login", screen: "Sign in" },
  { id: "R-02", path: "/signup", screen: "Create account" },
  { id: "R-03", path: "/forgot-password", screen: "Forgot password" },
  { id: "R-04", path: "/invite/:code", screen: "Accept invite" },
] as const;

export const SHELL_ROUTES: readonly PendingRoute[] = [
  { id: "R-05", path: "/onboarding", screen: "Onboarding" },
  { id: "R-06", path: "/", screen: "Home" },
  { id: "R-07", path: "/inbox", screen: "Inbox" },
  { id: "R-09", path: "/my-issues", screen: "My issues" },
  { id: "R-10", path: "/issues", screen: "All issues" },
  { id: "R-10", path: "/issues/list", screen: "All issues" },
  { id: "R-10", path: "/issues/board", screen: "All issues" },
  { id: "R-10", path: "/issues/table", screen: "All issues" },
  { id: "R-11", path: "/issue/:identifier", screen: "Issue" },
  { id: "R-12", path: "/v/:viewId", screen: "Saved view" },
  { id: "R-14", path: "/team/:teamKey/all", screen: "All issues" },
  { id: "R-14", path: "/team/:teamKey/active", screen: "Active" },
  { id: "R-14", path: "/team/:teamKey/backlog", screen: "Backlog" },
  { id: "R-14", path: "/team/:teamKey/t/:slug", screen: "Team view" },
  { id: "R-15", path: "/team/:teamKey/new", screen: "New issue" },
  { id: "R-16", path: "/triage", screen: "Triage" },
  { id: "R-17", path: "/projects", screen: "Projects" },
  { id: "R-18", path: "/project/:id", screen: "Project" },
  { id: "R-19", path: "/project/:id/board", screen: "Project board" },
  { id: "R-19", path: "/project/:id/list", screen: "Project list" },
  { id: "R-20", path: "/cycle/current", screen: "Current cycle" },
  { id: "R-21", path: "/cycle/:id", screen: "Cycle" },
  { id: "R-22", path: "/docs", screen: "Docs" },
  { id: "R-24", path: "/docs/page/new", screen: "New page" },
  { id: "R-23", path: "/docs/page/:id", screen: "Page" },
  { id: "R-25", path: "/search", screen: "Search" },
  { id: "R-26", path: "/insights", screen: "Insights" },
  { id: "R-27", path: "/ai", screen: "AI center" },
  { id: "R-28", path: "/ai/runs", screen: "AI runs" },
  { id: "R-29", path: "/ai/usage", screen: "AI usage" },
  { id: "R-30", path: "/ai/ask", screen: "Ask the workspace" },
  { id: "R-31", path: "/archive", screen: "Archive" },
  { id: "R-32", path: "/settings/profile", screen: "Profile" },
  { id: "R-33", path: "/settings/sessions", screen: "Sessions" },
  { id: "R-34", path: "/settings/appearance", screen: "Appearance" },
  { id: "R-35", path: "/settings/notifications", screen: "Notifications" },
  { id: "R-36", path: "/settings/members", screen: "Members" },
  { id: "R-37", path: "/settings/teams", screen: "Teams" },
  { id: "R-38", path: "/settings/teams/:teamKey", screen: "Team settings" },
  { id: "R-39", path: "/settings/workflows", screen: "Workflows" },
  { id: "R-40", path: "/settings/labels", screen: "Labels" },
  { id: "R-41", path: "/settings/templates", screen: "Templates" },
  { id: "R-42", path: "/settings/api-keys", screen: "API keys" },
  { id: "R-43", path: "/settings/webhooks", screen: "Webhooks" },
  { id: "R-44", path: "/settings/webhooks/:id", screen: "Webhook deliveries" },
  { id: "R-45", path: "/settings/import-export", screen: "Import / export" },
  { id: "R-46", path: "/settings/workspace", screen: "Workspace" },
  { id: "R-47", path: "/settings/ai", screen: "AI settings" },
  { id: "R-48", path: "/admin/activity", screen: "Activity" },
] as const;

/** Client redirects (ux-spec §2.2): R-08 alias, R-13 team default view. */
export const REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/notifications", to: "/inbox" },
];

interface CrumbPattern {
  match: RegExp;
  crumbs: (m: RegExpMatchArray) => Crumb[];
}

/** One breadcrumb entry: label + real destination (null = inert text). */
export interface Crumb {
  label: string;
  to: string | null;
}

const SETTINGS_LABEL = "Settings";
const SETTINGS_CRUMB: Crumb = { label: SETTINGS_LABEL, to: "/settings/profile" };

/** Breadcrumb mapping (SB-10): workspace / team / view / identifier. */
const CRUMB_PATTERNS: CrumbPattern[] = [
  { match: /^\/$/, crumbs: () => [{ label: "Home", to: "/" }] },
  { match: /^\/onboarding$/, crumbs: () => [{ label: "Onboarding", to: null }] },
  { match: /^\/inbox$/, crumbs: () => [{ label: "Inbox", to: "/inbox" }] },
  { match: /^\/my-issues$/, crumbs: () => [{ label: "My issues", to: "/my-issues" }] },
  { match: /^\/issues(\/(list|board|table))?$/, crumbs: () => [{ label: "Issues", to: "/issues" }] },
  { match: /^\/issue\/([^/]+)$/, crumbs: (m) => [{ label: m[1] ?? "", to: null }] },
  { match: /^\/v\/([^/]+)$/, crumbs: (m) => [{ label: `View ${m[1] ?? ""}`, to: null }] },
  { match: /^\/team\/([^/]+)$/, crumbs: (m) => [{ label: m[1] ?? "", to: `/team/${m[1]}/all` }] },
  {
    match: /^\/team\/([^/]+)\/(all|active|backlog|new)$/,
    crumbs: (m) => [
      { label: m[1] ?? "", to: `/team/${m[1]}/all` },
      { label: labelTeamView(m[2] ?? ""), to: null },
    ],
  },
  {
    match: /^\/team\/([^/]+)\/t\/([^/]+)$/,
    crumbs: (m) => [
      { label: m[1] ?? "", to: `/team/${m[1]}/all` },
      { label: m[2] ?? "", to: null },
    ],
  },
  { match: /^\/triage$/, crumbs: () => [{ label: "Triage", to: "/triage" }] },
  { match: /^\/projects$/, crumbs: () => [{ label: "Projects", to: "/projects" }] },
  {
    match: /^\/project\/([^/]+)(\/(board|list))?$/,
    crumbs: (m) => [{ label: "Projects", to: "/projects" }, { label: m[1] ?? "", to: null }],
  },
  {
    match: /^\/cycle\/current$/,
    crumbs: () => [{ label: "Cycles", to: "/cycle/current" }, { label: "Current", to: null }],
  },
  {
    match: /^\/cycle\/([^/]+)$/,
    crumbs: (m) => [{ label: "Cycles", to: "/cycle/current" }, { label: m[1] ?? "", to: null }],
  },
  { match: /^\/docs$/, crumbs: () => [{ label: "Docs", to: "/docs" }] },
  {
    match: /^\/docs\/page\/([^/]+)$/,
    crumbs: (m) => [{ label: "Docs", to: "/docs" }, { label: m[1] ?? "", to: null }],
  },
  { match: /^\/search$/, crumbs: () => [{ label: "Search", to: "/search" }] },
  { match: /^\/insights$/, crumbs: () => [{ label: "Insights", to: "/insights" }] },
  { match: /^\/ai$/, crumbs: () => [{ label: "AI center", to: "/ai" }] },
  {
    match: /^\/ai\/(runs|usage|ask)$/,
    crumbs: (m) => [
      { label: "AI center", to: "/ai" },
      { label: labelAiRoute(m[1] ?? ""), to: null },
    ],
  },
  { match: /^\/archive$/, crumbs: () => [{ label: "Archive", to: "/archive" }] },
  {
    match: /^\/admin\/activity$/,
    crumbs: () => [{ label: "Admin", to: null }, { label: "Activity", to: "/admin/activity" }],
  },
  {
    match: /^\/settings\/(teams|webhooks)\/([^/]+)$/,
    crumbs: (m) => [
      SETTINGS_CRUMB,
      { label: labelSettings(`/settings/${m[1]}`), to: `/settings/${m[1]}` },
      { label: m[2] ?? "", to: null },
    ],
  },
  {
    match: /^\/settings\/?([^/]*)$/,
    crumbs: (m) => [SETTINGS_CRUMB, { label: labelSettings(`/settings/${m[1] ?? ""}`), to: null }],
  },
];

function labelTeamView(view: string): string {
  if (view === "new") return "New issue";
  if (view === "all") return "All issues";
  return view.charAt(0).toUpperCase() + view.slice(1);
}

function labelAiRoute(sub: string): string {
  if (sub === "runs") return "Runs";
  if (sub === "usage") return "Usage";
  return "Ask";
}

function labelSettings(path: string): string {
  const found = SHELL_ROUTES.find((r) => r.path === path);
  return found?.screen ?? SETTINGS_LABEL;
}

/** Crumbs for a pathname, prefixed by the workspace name (SB-10). */
export function crumbsFor(pathname: string, workspaceName: string): Crumb[] {
  for (const pattern of CRUMB_PATTERNS) {
    const m = pathname.match(pattern.match);
    if (m) {
      const tail = pattern.crumbs(m).filter((c) => c.label.length > 0);
      return [{ label: workspaceName, to: "/" }, ...tail];
    }
  }
  return [{ label: workspaceName, to: "/" }];
}
