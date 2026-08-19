/**
 * Issues + views client. Uses the island fetch wrapper; PATCH/DELETE live
 * on the shared client (small M2 additive — see ticket work log).
 */
import { apiDelete, apiGet, apiPatch, apiPost } from "@island/app/api";
import type { FilterNode } from "@/lib/validation/views";
import type { IssueLayout, IssueListItem, LabelOption, MemberOption, SavedView, StateOption, TeamOption } from "./types";

interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export function issuesQuery(params: {
  wsId: string;
  filters?: FilterNode;
  sort?: string;
  limit?: number;
  cursor?: string | null;
}): string {
  const q = new URLSearchParams();
  q.set("wsId", params.wsId);
  if (params.filters) q.set("filters", JSON.stringify(params.filters));
  q.set("sort", params.sort ?? "updated:desc");
  q.set("limit", String(params.limit ?? 50));
  if (params.cursor) q.set("cursor", params.cursor);
  return `/api/issues?${q.toString()}`;
}

export function listIssues(params: {
  wsId: string;
  filters?: FilterNode;
  sort?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<Page<IssueListItem>> {
  return apiGet<Page<IssueListItem>>(issuesQuery(params));
}

export function listTeams(wsId: string): Promise<Page<TeamOption>> {
  return apiGet(`/api/teams?wsId=${encodeURIComponent(wsId)}`);
}

export function patchIssue(
  wsId: string,
  idOrIdentifier: string,
  body: Record<string, unknown>,
  expectedVersion?: number,
): Promise<{ issue: IssueListItem }> {
  const q = new URLSearchParams({ wsId });
  if (expectedVersion !== undefined) q.set("expectedVersion", String(expectedVersion));
  return apiPatch<{ issue: IssueListItem }>(
    `/api/issues/${encodeURIComponent(idOrIdentifier)}?${q.toString()}`,
    body,
  );
}

export function bulkIssues(
  wsId: string,
  body: { ids: string[]; action: string; value?: unknown },
): Promise<{ undoToken: string; updated: number }> {
  return apiPost(`/api/issues/bulk?wsId=${encodeURIComponent(wsId)}`, body);
}

export function undoToken(wsId: string, token: string): Promise<{ ok: boolean }> {
  return apiPost(`/api/undo/${encodeURIComponent(token)}?wsId=${encodeURIComponent(wsId)}`);
}

export function listViews(wsId: string): Promise<Page<SavedView>> {
  return apiGet(`/api/views?wsId=${encodeURIComponent(wsId)}`);
}

export function getView(wsId: string, viewId: string): Promise<{ view: SavedView }> {
  return apiGet(`/api/views/${encodeURIComponent(viewId)}?wsId=${encodeURIComponent(wsId)}`);
}

export function createView(
  wsId: string,
  body: {
    name: string;
    scope?: "workspace" | "team" | "project";
    teamId?: string | null;
    projectId?: string | null;
    layout?: IssueLayout;
    filters?: FilterNode;
    groupBy?: string | null;
    orderBy?: string;
    orderDir?: string;
    display?: Record<string, unknown>;
  },
): Promise<{ view: SavedView }> {
  return apiPost(`/api/views?wsId=${encodeURIComponent(wsId)}`, body);
}

export function patchView(
  wsId: string,
  viewId: string,
  body: Record<string, unknown>,
): Promise<{ view: SavedView }> {
  return apiPatch(`/api/views/${encodeURIComponent(viewId)}?wsId=${encodeURIComponent(wsId)}`, body);
}

export function favoriteView(wsId: string, viewId: string): Promise<{ favorited: boolean }> {
  return apiPost(`/api/views/${encodeURIComponent(viewId)}/favorite?wsId=${encodeURIComponent(wsId)}`);
}

export function listLabels(wsId: string): Promise<Page<LabelOption>> {
  return apiGet(`/api/labels?wsId=${encodeURIComponent(wsId)}`);
}

export function listMembers(wsId: string): Promise<Page<MemberOption>> {
  return apiGet(`/api/workspaces/${encodeURIComponent(wsId)}/members`);
}

export function listTeamStates(teamId: string): Promise<Page<StateOption>> {
  return apiGet(`/api/teams/${encodeURIComponent(teamId)}/states`);
}

export function deleteView(wsId: string, viewId: string): Promise<{ ok: boolean }> {
  return apiDelete(`/api/views/${encodeURIComponent(viewId)}?wsId=${encodeURIComponent(wsId)}`);
}
