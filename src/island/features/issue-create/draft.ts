/** Last-used team + Esc draft for the new-issue modal (FM-012). */
export interface IssueDraft {
  teamId: string;
  title: string;
  descriptionMd: string;
  priority: number;
  stateId?: string;
  createAnother: boolean;
}

function draftKey(wsId: string): string {
  return `pmx-issue-draft:${wsId}`;
}

function lastTeamKey(wsId: string): string {
  return `pmx-last-team:${wsId}`;
}

export function loadDraft(wsId: string): IssueDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(wsId));
    if (!raw) return null;
    return JSON.parse(raw) as IssueDraft;
  } catch {
    return null;
  }
}

export function saveDraft(wsId: string, draft: IssueDraft): void {
  try {
    window.localStorage.setItem(draftKey(wsId), JSON.stringify(draft));
  } catch {
    // storage disabled
  }
}

export function clearDraft(wsId: string): void {
  try {
    window.localStorage.removeItem(draftKey(wsId));
  } catch {
    // storage disabled
  }
}

export function loadLastTeamId(wsId: string): string | null {
  try {
    return window.localStorage.getItem(lastTeamKey(wsId));
  } catch {
    return null;
  }
}

export function saveLastTeamId(wsId: string, teamId: string): void {
  try {
    window.localStorage.setItem(lastTeamKey(wsId), teamId);
  } catch {
    // storage disabled
  }
}
