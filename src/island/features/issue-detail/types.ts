/**
 * Detail-panel shapes. Extends the T-003 list item with description
 * and the tab payloads from architecture §3.4.
 */
import type { IssueListItem } from "@island/features/issues/types";

export type IssueTab = "description" | "comments" | "activity" | "relations" | "subissues" | "attachments";

export interface IssueDetail extends IssueListItem {
  descriptionMd: string;
  triagedAt: number | null;
}

export interface IssueComment {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  parentId: string | null;
  authorId: string;
  bodyMd: string;
  resolvedAt: number | null;
  resolvedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryRow {
  id: string;
  actorId: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: number;
}

export interface DescriptionVersion {
  id: string;
  issueId: string;
  bodyMd: string;
  createdBy: string;
  createdAt: number;
}

export interface RelationRow {
  id: string;
  issueId: string;
  relatedIssueId: string;
  type: "related" | "blocked_by" | "blocking" | "duplicate";
}

export interface SubscriberRow {
  issueId: string;
  userId: string;
  reason: string;
}

export const ISSUE_TABS: readonly { id: IssueTab; label: string }[] = [
  { id: "description", label: "Description" },
  { id: "comments", label: "Comments" },
  { id: "activity", label: "Activity" },
  { id: "relations", label: "Relations" },
  { id: "subissues", label: "Sub-issues" },
  { id: "attachments", label: "Attachments" },
];
