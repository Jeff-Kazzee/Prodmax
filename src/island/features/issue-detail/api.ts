/** Issue detail client: GET/PATCH plus lazily fetched tab endpoints. */
import { apiDelete, apiGet, apiPatch, apiPost } from "@island/app/api";
import type { IssueListItem } from "@island/features/issues/types";
import type {
  DescriptionVersion,
  HistoryRow,
  IssueComment,
  IssueDetail,
  RelationRow,
  SubscriberRow,
} from "./types";

function qs(wsId: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ wsId, ...extra });
  return q.toString();
}

function issuePath(id: string): string {
  return `/api/issues/${encodeURIComponent(id)}`;
}

export function getIssue(wsId: string, id: string): Promise<{ issue: IssueDetail }> {
  return apiGet(`${issuePath(id)}?${qs(wsId)}`);
}

export function patchIssueDetail(
  wsId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<{ issue: IssueDetail }> {
  return apiPatch(`${issuePath(id)}?${qs(wsId)}`, body);
}

export function listComments(wsId: string, id: string): Promise<{ data: IssueComment[] }> {
  return apiGet(`${issuePath(id)}/comments?${qs(wsId)}`);
}

export function createComment(
  wsId: string,
  id: string,
  body: { bodyMd: string; parentId?: string | null },
): Promise<{ comment: IssueComment }> {
  return apiPost(`${issuePath(id)}/comments?${qs(wsId)}`, body);
}

export function patchComment(
  commentId: string,
  body: { bodyMd?: string; resolvedAt?: number | null },
): Promise<{ comment: IssueComment }> {
  return apiPatch(`/api/comments/${encodeURIComponent(commentId)}`, body);
}

export function deleteComment(commentId: string): Promise<{ ok: boolean }> {
  return apiDelete(`/api/comments/${encodeURIComponent(commentId)}`);
}

export function listHistory(wsId: string, id: string): Promise<{ data: HistoryRow[]; nextCursor: string | null }> {
  return apiGet(`${issuePath(id)}/history?${qs(wsId)}`);
}

export function listDescriptionVersions(wsId: string, id: string): Promise<{ data: DescriptionVersion[] }> {
  return apiGet(`${issuePath(id)}/description-versions?${qs(wsId)}`);
}

export function restoreDescriptionVersion(
  wsId: string,
  id: string,
  versionId: string,
): Promise<{ issue: IssueDetail }> {
  return apiPost(`${issuePath(id)}/description-versions?${qs(wsId)}`, { versionId });
}

export function listRelations(wsId: string, id: string): Promise<{ data: RelationRow[] }> {
  return apiGet(`${issuePath(id)}/relations?${qs(wsId)}`);
}

export function addRelation(
  wsId: string,
  id: string,
  body: { relatedIssueId: string; type: RelationRow["type"] },
): Promise<{ relation: RelationRow }> {
  return apiPost(`${issuePath(id)}/relations?${qs(wsId)}`, body);
}

export function listSubscribers(wsId: string, id: string): Promise<{ data: SubscriberRow[] }> {
  return apiGet(`${issuePath(id)}/subscribers?${qs(wsId)}`);
}

export function addSubscriber(wsId: string, id: string): Promise<{ ok: boolean; userId: string }> {
  return apiPost(`${issuePath(id)}/subscribers?${qs(wsId)}`, { reason: "manual" });
}

export function removeSubscriber(wsId: string, id: string, userId: string): Promise<{ ok: boolean }> {
  return apiDelete(`${issuePath(id)}/subscribers?${qs(wsId, { userId })}`);
}

export function createSubIssue(
  wsId: string,
  body: { teamId: string; title: string; parentId: string },
): Promise<{ issue: IssueListItem }> {
  return apiPost(`/api/issues?${qs(wsId)}`, body);
}
