import { desc, eq } from "drizzle-orm";
import { issueDescriptionVersions, issueHistory } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import { runIssueWrite } from "./issues-events";
import type { IssueRow } from "./issues-scope";

export const HISTORY_GRACE_MS = 3 * 60 * 1000;

const HISTORY_FIELDS = [
  "title",
  "description",
  "state",
  "priority",
  "assignee",
  "estimate",
  "labels",
  "relations",
  "project",
  "cycle",
  "milestone",
  "due_date",
  "team",
] as const;

export type HistoryField = (typeof HISTORY_FIELDS)[number];

function inGrace(issue: IssueRow, now: number): boolean {
  return now - issue.createdAt < HISTORY_GRACE_MS;
}

export function recordCreatedHistory(issue: IssueRow, actorId: string): void {
  currentDb()
    .insert(issueHistory)
    .values({
      id: uuid7(),
      workspaceId: issue.workspaceId,
      issueId: issue.id,
      actorId,
      field: "created",
      oldValue: null,
      newValue: issue.title,
      createdAt: issue.createdAt,
    })
    .run();
}

/** Fold property edits within 3 minutes of create into the single "created" row. */
export function recordFieldChange(
  issue: IssueRow,
  actorId: string,
  field: HistoryField,
  oldValue: unknown,
  newValue: unknown,
  now: number,
): void {
  if (inGrace(issue, now)) return;
  currentDb()
    .insert(issueHistory)
    .values({
      id: uuid7(),
      workspaceId: issue.workspaceId,
      issueId: issue.id,
      actorId,
      field,
      oldValue: oldValue === null || oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue: newValue === null || newValue === undefined ? null : JSON.stringify(newValue),
      createdAt: now,
    })
    .run();
}

export function snapshotDescription(issue: IssueRow, actorId: string, bodyMd: string, now: number): void {
  const db = currentDb();
  if (inGrace(issue, now)) {
    const latest = db
      .select()
      .from(issueDescriptionVersions)
      .where(eq(issueDescriptionVersions.issueId, issue.id))
      .orderBy(desc(issueDescriptionVersions.createdAt))
      .get();
    if (latest) {
      db.update(issueDescriptionVersions)
        .set({ bodyMd, createdBy: actorId, createdAt: now })
        .where(eq(issueDescriptionVersions.id, latest.id))
        .run();
      return;
    }
  }
  db.insert(issueDescriptionVersions)
    .values({ id: uuid7(), issueId: issue.id, bodyMd, createdBy: actorId, createdAt: now })
    .run();
}

export function listIssueHistory(issueId: string) {
  return currentDb()
    .select()
    .from(issueHistory)
    .where(eq(issueHistory.issueId, issueId))
    .orderBy(desc(issueHistory.createdAt))
    .all();
}

export function listDescriptionVersions(issueId: string) {
  return currentDb()
    .select()
    .from(issueDescriptionVersions)
    .where(eq(issueDescriptionVersions.issueId, issueId))
    .orderBy(desc(issueDescriptionVersions.createdAt))
    .all();
}

export function restoreDescriptionVersion(issue: IssueRow, versionId: string, actorId: string, now: number): string {
  const version = currentDb()
    .select()
    .from(issueDescriptionVersions)
    .where(eq(issueDescriptionVersions.id, versionId))
    .get();
  if (!version || version.issueId !== issue.id) throw new HttpError("NOT_FOUND", "Description version not found");
  runIssueWrite(issue.workspaceId, actorId, (w) => {
    w.write(issue, { descriptionMd: version.bodyMd, updatedAt: now, version: issue.version + 1 });
    snapshotDescription(issue, actorId, version.bodyMd, now);
    recordFieldChange(issue, actorId, "description", issue.descriptionMd, version.bodyMd, now);
  });
  return version.bodyMd;
}
