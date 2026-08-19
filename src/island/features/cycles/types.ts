/**
 * Client-side cycle shapes for S-16 (R-20/R-21), mirroring the T-005
 * payloads (architecture §3.5).
 *
 * `statsSnapshot` is absent because the server strips it: a completed cycle
 * serves its frozen numbers through `stats`, and a running one serves live
 * ones through the same field. The client cannot and must not tell which by
 * reading the payload, only by reading `status`.
 */

export type CycleStatus = "future" | "active" | "completed";

export interface CycleCounts {
  issues: number;
  points: number;
}

export interface CycleStats {
  scope: CycleCounts;
  completed: CycleCounts;
}

export interface CycleDto {
  id: string;
  workspaceId: string;
  teamId: string;
  number: number;
  name: string | null;
  startsAt: number;
  endsAt: number;
  status: CycleStatus;
  closedAt: number | null;
  createdAt: number;
  stats: CycleStats;
}

/** The subset of a team row S-16 needs. GET /api/teams returns the full row. */
export interface CycleTeam {
  id: string;
  key: string;
  name: string;
  position: string;
  cyclesEnabled: number;
  autoAddToCycle: number;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export function cycleName(cycle: CycleDto): string {
  return cycle.name ?? `Cycle ${cycle.number}`;
}
