/**
 * Client-side grouping over loaded pages (architecture §3.4) plus collapse
 * persistence per view (L-01).
 */
import { PRIORITY_LABELS, type GroupBy, type IssueListItem, type LookupMaps } from "./types";

export interface IssueGroup {
  id: string;
  label: string;
  issues: IssueListItem[];
  points: number;
}

const COLLAPSE_PREFIX = "pmx:collapse:";

export function collapseStorageKey(viewKey: string): string {
  return `${COLLAPSE_PREFIX}${viewKey}`;
}

export function loadCollapsed(viewKey: string): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(collapseStorageKey(viewKey));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    /* ignore corrupt prefs */
  }
  return {};
}

export function persistCollapsed(viewKey: string, collapsed: Record<string, boolean>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(collapseStorageKey(viewKey), JSON.stringify(collapsed));
}

export function toggleCollapsed(
  collapsed: Record<string, boolean>,
  groupId: string,
): Record<string, boolean> {
  return { ...collapsed, [groupId]: !collapsed[groupId] };
}

function pointsOf(issues: IssueListItem[]): number {
  return issues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0);
}

function push(map: Map<string, IssueGroup>, id: string, label: string, issue: IssueListItem): void {
  const existing = map.get(id);
  if (existing) {
    existing.issues.push(issue);
    existing.points += issue.estimate ?? 0;
    return;
  }
  map.set(id, { id, label, issues: [issue], points: issue.estimate ?? 0 });
}

export function groupIssues(
  issues: IssueListItem[],
  groupBy: GroupBy,
  lookup: LookupMaps,
): IssueGroup[] {
  if (groupBy === "none") {
    return [{ id: "all", label: "All issues", issues, points: pointsOf(issues) }];
  }
  const map = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const { id, label } = groupKey(issue, groupBy, lookup);
    push(map, id, label, issue);
  }
  return [...map.values()];
}

function groupKey(
  issue: IssueListItem,
  groupBy: GroupBy,
  lookup: LookupMaps,
): { id: string; label: string } {
  switch (groupBy) {
    case "none":
      return { id: "all", label: "All issues" };
    case "status": {
      const state = lookup.states[issue.stateId];
      return { id: issue.stateId, label: state?.name ?? "Unknown state" };
    }
    case "assignee": {
      if (!issue.assigneeId) return { id: "unassigned", label: "Unassigned" };
      const member = lookup.members[issue.assigneeId];
      return { id: issue.assigneeId, label: member?.name ?? "Unknown" };
    }
    case "priority":
      return {
        id: String(issue.priority),
        label: PRIORITY_LABELS[issue.priority] ?? "No priority",
      };
    case "team": {
      const team = lookup.teams[issue.teamId];
      return { id: issue.teamId, label: team ? `${team.key} · ${team.name}` : issue.teamId };
    }
    case "label": {
      const first = issue.labelIds[0];
      if (!first) return { id: "unlabelled", label: "No label" };
      return { id: first, label: lookup.labels[first]?.name ?? first };
    }
    case "project":
      return {
        id: issue.projectId ?? "none",
        label: issue.projectId ?? "No project",
      };
    case "cycle":
      return {
        id: issue.cycleId ?? "none",
        label: issue.cycleId ?? "No cycle",
      };
    default: {
      const _never: never = groupBy;
      return { id: String(_never), label: "Other" };
    }
  }
}

export function ensureStatusColumns(
  groups: IssueGroup[],
  states: { id: string; name: string; position: string }[],
): IssueGroup[] {
  if (states.length === 0) return groups;
  const byId = new Map(groups.map((g) => [g.id, g]));
  return [...states]
    .sort((a, b) => a.position.localeCompare(b.position))
    .map(
      (s) =>
        byId.get(s.id) ?? {
          id: s.id,
          label: s.name,
          issues: [],
          points: 0,
        },
    );
}
export function propertyPatchForGroup(
  groupBy: GroupBy,
  groupId: string,
): Record<string, unknown> | null {
  if (groupBy === "status") return { stateId: groupId };
  if (groupBy === "assignee") return { assigneeId: groupId === "unassigned" ? null : groupId };
  if (groupBy === "priority") return { priority: Number(groupId) };
  if (groupBy === "project") return { projectId: groupId === "none" ? null : groupId };
  if (groupBy === "cycle") return { cycleId: groupId === "none" ? null : groupId };
  return null;
}
