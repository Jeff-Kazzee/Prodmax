/**
 * Client-side issue/view shapes consumed by S-07…S-11.
 * Mirrors T-002 list/view JSON (architecture §3.4) without importing the
 * service layer into the island.
 */
import type { FilterNode } from "@/lib/validation/views";

export type IssueLayout = "list" | "board" | "table";

export type GroupBy =
  | "none"
  | "status"
  | "assignee"
  | "priority"
  | "team"
  | "label"
  | "project"
  | "cycle";

export type OrderBy = "created" | "updated" | "status" | "priority" | "due" | "manual";
export type OrderDir = "asc" | "desc";

export interface IssueListItem {
  id: string;
  workspaceId: string;
  teamId: string;
  number: number;
  identifier: string;
  title: string;
  stateId: string;
  priority: number;
  estimate: number | null;
  assigneeId: string | null;
  creatorId: string;
  projectId: string | null;
  milestoneId: string | null;
  cycleId: string | null;
  parentId: string | null;
  dueDate: string | null;
  position: string;
  version: number;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  labelIds: string[];
}

export interface SavedView {
  id: string;
  workspaceId: string;
  ownerId: string;
  scope: "workspace" | "team" | "project";
  teamId: string | null;
  projectId: string | null;
  name: string;
  layout: IssueLayout;
  filters: FilterNode;
  groupBy: string | null;
  subGroupBy: string | null;
  orderBy: OrderBy;
  orderDir: OrderDir;
  display: Record<string, unknown>;
  favorited: boolean;
}

export interface LabelOption {
  id: string;
  name: string;
  color: string | null;
}

export interface MemberOption {
  userId: string;
  name: string;
}

export interface StateOption {
  id: string;
  teamId: string;
  name: string;
  category: string;
  color: string | null;
  position: string;
}

export interface TeamOption {
  id: string;
  key: string;
  name: string;
}

export interface LookupMaps {
  states: Record<string, StateOption>;
  teams: Record<string, TeamOption>;
  members: Record<string, MemberOption>;
  labels: Record<string, LabelOption>;
}

export const PRIORITY_LABELS = ["No priority", "Low", "Medium", "High", "Urgent"] as const;

export const STATUS_CATEGORIES = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
] as const;
