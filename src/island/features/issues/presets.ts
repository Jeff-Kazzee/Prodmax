/**
 * Route presets for R-09 / R-10 / R-14 / R-19. Extra filters AND with `?f=`.
 */
import type { FilterGroup, FilterNode } from "@/lib/validation/views";
import { EMPTY_FILTER, isEmptyFilter, isGroup } from "./filter-ast";
import type { GroupBy, IssueLayout, OrderBy, OrderDir } from "./types";

export interface IssueRoutePreset {
  title: string;
  extra: FilterNode;
  defaultGroupBy: GroupBy;
  defaultLayout: IssueLayout;
  defaultOrderBy: OrderBy;
  defaultOrderDir: OrderDir;
}

function andOf(...nodes: FilterNode[]): FilterGroup {
  const children = nodes.filter((n) => !isEmptyFilter(n));
  return { combinator: "and", children };
}

const OPEN: FilterNode = {
  field: "statusCategory",
  op: "nin",
  value: ["completed", "canceled"],
};

export function presetForPath(
  pathname: string,
  ctx: { userId: string; teamIdByKey: Record<string, string> },
): IssueRoutePreset {
  const myIssues: FilterGroup = andOf(
    { field: "assignee", op: "eq", value: ctx.userId },
    OPEN,
  );
  if (pathname === "/my-issues") {
    return {
      title: "My issues",
      extra: myIssues,
      defaultGroupBy: "status",
      defaultLayout: "list",
      defaultOrderBy: "updated",
      defaultOrderDir: "desc",
    };
  }

  const teamMatch = pathname.match(/^\/team\/([^/]+)\/(all|active|backlog|t\/[^/]+)/);
  if (teamMatch) {
    const key = teamMatch[1] ?? "";
    const view = teamMatch[2] ?? "all";
    const teamId = ctx.teamIdByKey[key];
    const teamLeaf: FilterNode | null = teamId
      ? { field: "team", op: "eq", value: teamId }
      : null;
    const extra =
      view === "active"
        ? andOf(
            ...(teamLeaf ? [teamLeaf] : []),
            { field: "statusCategory", op: "in", value: ["unstarted", "started"] },
          )
        : view === "backlog"
          ? andOf(
              ...(teamLeaf ? [teamLeaf] : []),
              { field: "statusCategory", op: "eq", value: "backlog" },
            )
          : teamLeaf
            ? andOf(teamLeaf)
            : EMPTY_FILTER;
    const title =
      view === "active" ? `${key} · Active` : view === "backlog" ? `${key} · Backlog` : `${key} · All issues`;
    return {
      title,
      extra,
      defaultGroupBy: "status",
      defaultLayout: "list",
      defaultOrderBy: "updated",
      defaultOrderDir: "desc",
    };
  }

  const projectMatch = pathname.match(/^\/project\/([^/]+)\/(board|list)$/);
  if (projectMatch) {
    const projectId = projectMatch[1] ?? "";
    const layout: IssueLayout = projectMatch[2] === "board" ? "board" : "list";
    return {
      title: "Project issues",
      extra: andOf({ field: "project", op: "eq", value: projectId }),
      defaultGroupBy: "status",
      defaultLayout: layout,
      defaultOrderBy: "updated",
      defaultOrderDir: "desc",
    };
  }

  return {
    title: "All issues",
    extra: EMPTY_FILTER,
    defaultGroupBy: layoutFromPath(pathname) === "board" ? "status" : "none",
    defaultLayout: layoutFromPath(pathname),
    defaultOrderBy: "updated",
    defaultOrderDir: "desc",
  };
}

export function layoutFromPath(pathname: string): IssueLayout {
  if (pathname.endsWith("/board")) return "board";
  if (pathname.endsWith("/table")) return "table";
  return "list";
}

export function mergeFilters(preset: FilterNode, urlFilter: FilterNode): FilterNode {
  if (isEmptyFilter(preset)) return urlFilter;
  if (isEmptyFilter(urlFilter)) return preset;
  const presetChildren = isGroup(preset) ? preset.children : [preset];
  const urlChildren = isGroup(urlFilter) ? urlFilter.children : [urlFilter];
  return { combinator: "and", children: [...presetChildren, ...urlChildren] };
}

export function pathForLayout(pathname: string, layout: IssueLayout): string {
  if (pathname.startsWith("/issues")) {
    if (layout === "list") return "/issues";
    return `/issues/${layout}`;
  }
  const stripped = pathname.replace(/\/(list|board|table)$/, "");
  if (pathname.startsWith("/project/")) return `${stripped}/${layout === "table" ? "list" : layout}`;
  return pathname;
}
