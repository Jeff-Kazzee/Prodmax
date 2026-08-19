import { and, type SQL } from "drizzle-orm";
import { issues } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";
import { pageParams, paginate } from "@/lib/api/paginate";
import type { z } from "zod";
import type { createIssueSchema } from "@/lib/validation/issues";
import { runIssueWrite } from "./issues-events";
import { compileFilter, issueOrder, parseFiltersParam } from "./issues-filters";
import {
  allocateIdentifier,
  defaultStateForTeam,
  nextIssuePosition,
  replaceIssueLabels,
  requireStateOnTeam,
  requireTeamInWorkspace,
  withLabels,
  assertParentsInWorkspace,
} from "./issues-helpers";
import { recordCreatedHistory, snapshotDescription } from "./issues-history";
import { addSubscriber } from "./issues-relations";
import { assertIssueTeamAccess, issueScope, requireLiveIssue, type IssueRow } from "./issues-scope";

export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export function createIssue(
  wsId: string,
  actor: { userId: string; role: Role },
  input: CreateIssueInput,
): IssueRow & { labelIds: string[]; suggestions: [] } {
  const team = requireTeamInWorkspace(wsId, input.teamId);
  assertIssueTeamAccess(actor.role, actor.userId, team.id);
  assertParentsInWorkspace(wsId, input);
  const state = input.stateId
    ? requireStateOnTeam(team.id, input.stateId)
    : defaultStateForTeam(team);
  const now = Date.now();
  const id = uuid7();

  const created = runIssueWrite(wsId, actor.userId, (w) => {
    const ident = allocateIdentifier(team.id);
    w.noteState(state);
    const row = w.insert({
      id,
      workspaceId: wsId,
      teamId: team.id,
      number: ident.number,
      identifier: ident.identifier,
      title: input.title,
      descriptionMd: input.descriptionMd ?? "",
      stateId: state.id,
      priority: input.priority ?? 0,
      estimate: input.estimate ?? null,
      assigneeId: input.assigneeId ?? null,
      creatorId: actor.userId,
      projectId: input.projectId ?? null,
      milestoneId: input.milestoneId ?? null,
      cycleId: input.cycleId ?? null,
      parentId: input.parentId ?? null,
      dueDate: input.dueDate ?? null,
      position: nextIssuePosition(team.id),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    if (input.labelIds?.length) replaceIssueLabels(wsId, id, input.labelIds);
    recordCreatedHistory(row, actor.userId);
    if (row.descriptionMd) snapshotDescription(row, actor.userId, row.descriptionMd, now);
    addSubscriber(row.id, actor.userId, "created");
    if (row.assigneeId) addSubscriber(row.id, row.assigneeId, "assigned");
    return row;
  });

  return { ...withLabels(created), suggestions: [] };
}

export function getIssue(wsId: string, actor: { userId: string; role: Role }, idOrIdentifier: string) {
  const issue = requireLiveIssue(wsId, idOrIdentifier, actor.role, actor.userId);
  return withLabels(issue);
}

export function listIssues(wsId: string, actor: { userId: string; role: Role }, request: Request) {
  const url = new URL(request.url);
  const filter = parseFiltersParam(url.searchParams.get("filters"));
  const { limit } = pageParams(url);
  const clauses: SQL[] = [issueScope(wsId, actor.role, actor.userId)];
  if (filter) clauses.push(compileFilter(filter));
  const rows = currentDb()
    .select()
    .from(issues)
    .where(and(...clauses))
    .orderBy(...issueOrder(url.searchParams.get("sort")))
    .all();
  const page = paginate(rows, url.searchParams.get("cursor"), limit);
  return { data: page.data.map(withLabels), nextCursor: page.nextCursor };
}

export function trashIssue(
  wsId: string,
  actor: { userId: string; role: Role },
  idOrIdentifier: string,
  expectedVersion: number | undefined,
): IssueRow {
  const issue = requireLiveIssue(wsId, idOrIdentifier, actor.role, actor.userId);
  if (expectedVersion !== undefined && issue.version !== expectedVersion) {
    throw new HttpError("CONFLICT", "Version conflict", [`expectedVersion: ${expectedVersion}`, `actual: ${issue.version}`]);
  }
  const now = Date.now();
  return runIssueWrite(wsId, actor.userId, (w) =>
    w.write(issue, { deletedAt: now, updatedAt: now, version: issue.version + 1 }),
  );
}
