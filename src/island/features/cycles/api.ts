/**
 * Cycles client (architecture §3.5).
 *
 * The list is flat and team-scoped by query parameter rather than a
 * `/api/teams/:id/cycles` path, because M4 owns `src/pages/api/cycles/**` and
 * M1 owns `src/pages/api/teams/**` (§8). `teamId` is required; omitting it is
 * a 400, not an all-teams list.
 *
 * There is no GET for a single cycle, only PATCH, so R-21 resolves a cycle by
 * scanning its team's list. See T-032.
 */
import { apiGet, apiPatch, apiPost } from "@island/app/api";
import type { CycleCounts, CycleDto, CycleTeam, Page } from "./types";

const q = encodeURIComponent;

export function listCycles(wsId: string, teamId: string): Promise<Page<CycleDto>> {
  return apiGet<Page<CycleDto>>(`/api/cycles?wsId=${q(wsId)}&teamId=${q(teamId)}`);
}

export function listTeams(wsId: string): Promise<Page<CycleTeam>> {
  return apiGet<Page<CycleTeam>>(`/api/teams?wsId=${q(wsId)}`);
}

export function patchCycle(
  wsId: string,
  id: string,
  body: { name?: string; startsAt?: number; endsAt?: number },
): Promise<{ cycle: CycleDto }> {
  return apiPatch<{ cycle: CycleDto }>(`/api/cycles/${q(id)}?wsId=${q(wsId)}`, body);
}

/**
 * Remove is applied before add server-side, so an id in both lists ends up
 * scoped. Callers send one intent at a time.
 */
export function scopeCycle(
  wsId: string,
  id: string,
  body: { add?: string[]; remove?: string[] },
): Promise<{ cycle: CycleDto; scope: CycleCounts }> {
  return apiPost<{ cycle: CycleDto; scope: CycleCounts }>(
    `/api/cycles/${q(id)}/scope?wsId=${q(wsId)}`,
    body,
  );
}

export function closeCycle(
  wsId: string,
  id: string,
): Promise<{
  cycle: CycleDto;
  rollover: { count: number; nextCycleId: string; nextCycleCreated: boolean };
}> {
  return apiPost(`/api/cycles/${q(id)}/close?wsId=${q(wsId)}`, {});
}
