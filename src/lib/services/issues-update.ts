import { issueRedirects, issues } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import type { Role } from "@/lib/api/guards";
import type { z } from "zod";
import type { patchIssueSchema } from "@/lib/validation/issues";
import { runIssueWrite } from "./issues-events";
import {
  allocateIdentifier,
  assertExpectedVersion,
  labelIdsOf,
  mapStateToTeam,
  replaceIssueLabels,
  requireStateOnTeam,
  requireTeamInWorkspace,
  stateTimestamps,
  withLabels,
} from "./issues-helpers";
import { recordFieldChange, snapshotDescription } from "./issues-history";
import { addSubscriber, downgradeBlockersIfResolved } from "./issues-relations";
import { assertIssueTeamAccess, requireLiveIssue, type IssueRow } from "./issues-scope";

export type PatchIssueInput = z.infer<typeof patchIssueSchema>;

export function updateIssue(
  wsId: string,
  actor: { userId: string; role: Role },
  idOrIdentifier: string,
  input: PatchIssueInput,
  expectedVersion: number | undefined,
): IssueRow & { labelIds: string[] } {
  const issue = requireLiveIssue(wsId, idOrIdentifier, actor.role, actor.userId);
  assertExpectedVersion(issue, expectedVersion);
  const now = Date.now();
  const updated = runIssueWrite(wsId, actor.userId, (w) => {
    const patch: Partial<typeof issues.$inferInsert> = { updatedAt: now, version: issue.version + 1 };

    if (input.title !== undefined && input.title !== issue.title) {
      recordFieldChange(issue, actor.userId, "title", issue.title, input.title, now);
      patch.title = input.title;
    }
    if (input.descriptionMd !== undefined && input.descriptionMd !== issue.descriptionMd) {
      recordFieldChange(issue, actor.userId, "description", issue.descriptionMd, input.descriptionMd, now);
      snapshotDescription(issue, actor.userId, input.descriptionMd, now);
      patch.descriptionMd = input.descriptionMd;
    }
    if (input.stateId !== undefined && input.stateId !== issue.stateId) {
      const state = requireStateOnTeam(issue.teamId, input.stateId);
      w.noteState(state);
      recordFieldChange(issue, actor.userId, "state", issue.stateId, input.stateId, now);
      patch.stateId = input.stateId;
      Object.assign(patch, stateTimestamps(issue, state, now));
      downgradeBlockersIfResolved(issue, input.stateId);
    }
    if (input.priority !== undefined && input.priority !== issue.priority) {
      recordFieldChange(issue, actor.userId, "priority", issue.priority, input.priority, now);
      patch.priority = input.priority;
    }
    if (input.estimate !== undefined && input.estimate !== issue.estimate) {
      recordFieldChange(issue, actor.userId, "estimate", issue.estimate, input.estimate, now);
      patch.estimate = input.estimate;
    }
    if (input.assigneeId !== undefined && input.assigneeId !== issue.assigneeId) {
      recordFieldChange(issue, actor.userId, "assignee", issue.assigneeId, input.assigneeId, now);
      patch.assigneeId = input.assigneeId;
      if (input.assigneeId) addSubscriber(issue.id, input.assigneeId, "assigned");
    }
    if (input.projectId !== undefined && input.projectId !== issue.projectId) {
      recordFieldChange(issue, actor.userId, "project", issue.projectId, input.projectId, now);
      patch.projectId = input.projectId;
    }
    if (input.milestoneId !== undefined && input.milestoneId !== issue.milestoneId) {
      recordFieldChange(issue, actor.userId, "milestone", issue.milestoneId, input.milestoneId, now);
      patch.milestoneId = input.milestoneId;
    }
    if (input.cycleId !== undefined && input.cycleId !== issue.cycleId) {
      recordFieldChange(issue, actor.userId, "cycle", issue.cycleId, input.cycleId, now);
      patch.cycleId = input.cycleId;
    }
    if (input.parentId !== undefined) patch.parentId = input.parentId;
    if (input.dueDate !== undefined && input.dueDate !== issue.dueDate) {
      recordFieldChange(issue, actor.userId, "due_date", issue.dueDate, input.dueDate, now);
      patch.dueDate = input.dueDate;
    }
    if (input.archived !== undefined) {
      patch.archivedAt = input.archived ? now : null;
    }
    if (input.labelIds !== undefined) {
      recordFieldChange(issue, actor.userId, "labels", labelIdsOf(issue.id), input.labelIds, now);
      replaceIssueLabels(wsId, issue.id, input.labelIds);
    }

    return w.write(issue, patch);
  });
  return withLabels(updated);
}

export function moveIssueTeam(
  wsId: string,
  actor: { userId: string; role: Role },
  idOrIdentifier: string,
  targetTeamId: string,
  expectedVersion: number | undefined,
): IssueRow & { labelIds: string[] } {
  const issue = requireLiveIssue(wsId, idOrIdentifier, actor.role, actor.userId);
  assertExpectedVersion(issue, expectedVersion);
  const target = requireTeamInWorkspace(wsId, targetTeamId);
  assertIssueTeamAccess(actor.role, actor.userId, target.id);
  if (target.id === issue.teamId) return withLabels(issue);

  const now = Date.now();
  const oldIdentifier = issue.identifier;
  const moved = runIssueWrite(wsId, actor.userId, (w) => {
    const ident = allocateIdentifier(target.id);
    const stateId = mapStateToTeam(issue.stateId, target.id);
    const row = w.write(issue, {
      teamId: target.id,
      number: ident.number,
      identifier: ident.identifier,
      stateId,
      updatedAt: now,
      version: issue.version + 1,
    });
    currentDb()
      .insert(issueRedirects)
      .values({ oldIdentifier, issueId: issue.id, workspaceId: wsId })
      .run();
    recordFieldChange(issue, actor.userId, "team", issue.teamId, target.id, now);
    return row;
  });
  return withLabels(moved);
}
