/** POST /api/issues plus a silent dedup check (T-012 endpoint; 404 = no banner). */
import { ApiError, apiPost } from "@island/app/api";
import type { IssueListItem } from "@island/features/issues/types";

export interface DedupSuggestion {
  identifier?: string;
  issueId?: string;
  score?: number;
  sharedTerms?: string[];
}

export interface CreatedIssue {
  issue: IssueListItem;
  suggestions: DedupSuggestion[];
}

export function createIssue(
  wsId: string,
  body: {
    teamId: string;
    title: string;
    descriptionMd?: string;
    priority?: number;
    stateId?: string;
    parentId?: string;
  },
): Promise<CreatedIssue> {
  return apiPost(`/api/issues?wsId=${encodeURIComponent(wsId)}`, body);
}

export async function checkDedup(
  wsId: string,
  body: { teamId: string; title: string; description: string },
): Promise<DedupSuggestion[]> {
  try {
    const res = await apiPost<{ candidates?: DedupSuggestion[] }>(
      `/api/ai/dedup/check?wsId=${encodeURIComponent(wsId)}`,
      body,
    );
    return res.candidates ?? [];
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.code === "NOT_FOUND")) return [];
    throw err;
  }
}
