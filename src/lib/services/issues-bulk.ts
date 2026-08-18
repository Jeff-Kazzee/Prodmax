import { and, eq } from "drizzle-orm";
import { issueRedirects, issues, undoTokens } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";
import type { z } from "zod";
import type { bulkIssueSchema } from "@/lib/validation/issues";
import { recordIssueMutation } from "./issues-events";
import { labelIdsOf, latestIssue, replaceIssueLabels } from "./issues-helpers";
import { requireLiveIssue, type IssueRow } from "./issues-scope";
import { moveIssueTeam, restoreIssue, updateIssue } from "./issues-update";
import { trashIssue } from "./issues";

export type BulkInput = z.infer<typeof bulkIssueSchema>;

type UndoSnapshot = {
  id: string;
  teamId: string;
  identifier: string;
  number: number;
  stateId: string;
  assigneeId: string | null;
  priority: number;
  projectId: string | null;
  cycleId: string | null;
  archivedAt: number | null;
  deletedAt: number | null;
  version: number;
  labelIds: string[];
};

type UndoPayload = { action: BulkInput["action"]; snapshots: UndoSnapshot[] };

function snapshotOf(issue: IssueRow): UndoSnapshot {
  return {
    id: issue.id,
    teamId: issue.teamId,
    identifier: issue.identifier,
    number: issue.number,
    stateId: issue.stateId,
    assigneeId: issue.assigneeId,
    priority: issue.priority,
    projectId: issue.projectId,
    cycleId: issue.cycleId,
    archivedAt: issue.archivedAt,
    deletedAt: issue.deletedAt,
    version: issue.version,
    labelIds: labelIdsOf(issue.id),
  };
}

function applyAction(
  wsId: string,
  actor: { userId: string; role: Role },
  issue: IssueRow,
  action: BulkInput["action"],
  value: unknown,
): void {
  switch (action) {
    case "state":
      if (typeof value !== "string") throw new HttpError("VALIDATION", "value must be a state id");
      updateIssue(wsId, actor, issue.id, { stateId: value }, undefined);
      return;
    case "assignee": {
      if (value !== null && typeof value !== "string") throw new HttpError("VALIDATION", "value must be a user id or null");
      updateIssue(wsId, actor, issue.id, { assigneeId: value === null ? null : value }, undefined);
      return;
    }
    case "labels":
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new HttpError("VALIDATION", "value must be a string[] of label ids");
      }
      updateIssue(wsId, actor, issue.id, { labelIds: value }, undefined);
      return;
    case "priority":
      if (typeof value !== "number") throw new HttpError("VALIDATION", "value must be a priority 0-4");
      updateIssue(wsId, actor, issue.id, { priority: value }, undefined);
      return;
    case "archive":
      updateIssue(wsId, actor, issue.id, { archived: value !== false }, undefined);
      return;
    case "delete":
      trashIssue(wsId, actor, issue.id, undefined);
      return;
    case "move_team":
      if (typeof value !== "string") throw new HttpError("VALIDATION", "value must be a team id");
      moveIssueTeam(wsId, actor, issue.id, value, undefined);
      return;
    case "cycle": {
      if (value !== null && typeof value !== "string") throw new HttpError("VALIDATION", "value must be a cycle id or null");
      updateIssue(wsId, actor, issue.id, { cycleId: value === null ? null : value }, undefined);
      return;
    }
    case "project": {
      if (value !== null && typeof value !== "string") throw new HttpError("VALIDATION", "value must be a project id or null");
      updateIssue(wsId, actor, issue.id, { projectId: value === null ? null : value }, undefined);
      return;
    }
    default: {
      const _never: never = action;
      throw new HttpError("VALIDATION", `Unknown bulk action: ${String(_never)}`);
    }
  }
}

function restoreSnapshot(wsId: string, snap: UndoSnapshot): void {
  const current = latestIssue(snap.id);
  if (snap.deletedAt === null && current.deletedAt) restoreIssue(snap.id);
  currentDb()
    .update(issues)
    .set({
      teamId: snap.teamId,
      identifier: snap.identifier,
      number: snap.number,
      stateId: snap.stateId,
      assigneeId: snap.assigneeId,
      priority: snap.priority,
      projectId: snap.projectId,
      cycleId: snap.cycleId,
      archivedAt: snap.archivedAt,
      deletedAt: snap.deletedAt,
      version: snap.version,
      updatedAt: Date.now(),
    })
    .where(eq(issues.id, snap.id))
    .run();
  replaceIssueLabels(wsId, snap.id, snap.labelIds);
  currentDb()
    .delete(issueRedirects)
    .where(and(eq(issueRedirects.issueId, snap.id), eq(issueRedirects.oldIdentifier, snap.identifier)))
    .run();
}

export function bulkUpdateIssues(
  wsId: string,
  actor: { userId: string; role: Role },
  input: BulkInput,
): { undoToken: string; updated: number } {
  return currentDb().transaction(() => {
    const snapshots: UndoSnapshot[] = [];
    for (const id of input.ids) {
      const issue = requireLiveIssue(wsId, id, actor.role, actor.userId);
      snapshots.push(snapshotOf(issue));
      applyAction(wsId, actor, issue, input.action, input.value);
    }
    const token = uuid7();
    currentDb()
      .insert(undoTokens)
      .values({
        id: token,
        workspaceId: wsId,
        actorId: actor.userId,
        payload: JSON.stringify({ action: input.action, snapshots } satisfies UndoPayload),
        createdAt: Date.now(),
        consumedAt: null,
      })
      .run();
    recordIssueMutation({
      kind: "updated",
      workspaceId: wsId,
      issueId: input.ids[0],
      actorId: actor.userId,
      patch: { bulk: input.action },
    });
    return { undoToken: token, updated: snapshots.length };
  });
}

export function applyUndo(wsId: string, actorId: string, token: string): { restored: number } {
  return currentDb().transaction(() => {
    const row = currentDb().select().from(undoTokens).where(eq(undoTokens.id, token)).get();
    if (!row || row.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Undo token not found");
    if (row.consumedAt) throw new HttpError("CONFLICT", "Undo token already used");
    const payload = JSON.parse(row.payload) as UndoPayload;
    for (const snap of payload.snapshots) restoreSnapshot(wsId, snap);
    currentDb()
      .update(undoTokens)
      .set({ consumedAt: Date.now() })
      .where(eq(undoTokens.id, token))
      .run();
    recordIssueMutation({
      kind: "updated",
      workspaceId: wsId,
      issueId: payload.snapshots[0]?.id ?? token,
      actorId,
      patch: { undo: true },
    });
    return { restored: payload.snapshots.length };
  });
}
