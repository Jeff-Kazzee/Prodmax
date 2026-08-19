/**
 * Pure cycle arithmetic. Kept out of the components so each rule can be
 * asserted directly rather than through a render.
 */
import type { IssueListItem, LookupMaps } from "@island/features/issues/types";
import type { CycleDto } from "./types";

/** CY-01 "day 6/10", clamped so a cycle read before or after its window reads sanely. */
export function dayXofY(cycle: CycleDto, now: number): { day: number; total: number } {
  const dayMs = 86_400_000;
  const total = Math.max(1, Math.ceil((cycle.endsAt - cycle.startsAt) / dayMs));
  const elapsed = Math.floor((now - cycle.startsAt) / dayMs) + 1;
  return { day: Math.min(total, Math.max(1, elapsed)), total };
}

/**
 * The set `closeCycle` would roll over, re-applied client-side.
 *
 * The server's rule is: issues on this cycle, not soft-deleted, whose state
 * category is not 'completed' and not 'canceled'. This mirrors it exactly.
 *
 * Two deliberate non-exclusions. An archived issue still rolls, because the
 * server's predicate tests `deleted_at`, not `archived_at`. An issue whose
 * state is missing from the lookup also counts, because the server would count
 * it: an incomplete client lookup is no reason to under-report what the server
 * is about to move.
 */
export function rolloverSet(issues: IssueListItem[], lookup: LookupMaps): IssueListItem[] {
  return issues.filter((issue) => {
    const category = lookup.states[issue.stateId]?.category;
    return category !== "completed" && category !== "canceled";
  });
}

export interface BurnPoint {
  /** Day index from cycle start, 0-based. */
  day: number;
  completed: number;
  ideal: number;
}

/**
 * CY-05 burn-up, honest about what the client can know.
 *
 * The completed series is real: it is the cumulative estimate of scoped issues
 * bucketed by `completedAt`. The scope series is NOT a series. Nothing records
 * when an issue entered a cycle, so scope is a single number, today's total,
 * which the chart draws as a flat reference line and the caption names as such.
 * A stepped scope line would be an invention. See T-031.
 */
export function burnUpSeries(
  cycle: CycleDto,
  issues: IssueListItem[],
  lookup: LookupMaps,
  now: number,
): { points: BurnPoint[]; scope: number } {
  const dayMs = 86_400_000;
  const { total } = dayXofY(cycle, now);
  const scope = issues.reduce((sum, i) => sum + (i.estimate ?? 0), 0);
  const elapsed = Math.min(total, Math.max(0, Math.floor((now - cycle.startsAt) / dayMs)));

  const doneByDay = new Array<number>(total + 1).fill(0);
  for (const issue of issues) {
    if (lookup.states[issue.stateId]?.category !== "completed") continue;
    if (issue.completedAt === null) continue;
    const day = Math.floor((issue.completedAt - cycle.startsAt) / dayMs);
    const slot = Math.min(total, Math.max(0, day));
    doneByDay[slot] = (doneByDay[slot] ?? 0) + (issue.estimate ?? 0);
  }

  const points: BurnPoint[] = [];
  let running = 0;
  for (let day = 0; day <= total; day++) {
    running += doneByDay[day] ?? 0;
    points.push({
      day,
      // Past today the completed line stops rather than flat-lining forward,
      // which would read as a claim that nothing more will land.
      completed: day <= elapsed ? running : Number.NaN,
      ideal: total === 0 ? scope : (scope * day) / total,
    });
  }
  return { points, scope };
}

/**
 * CY-02 capacity: the mean completed points of the last three closed cycles.
 * Returns null when no cycle has closed, because the ux-spec's headcount
 * fallback needs a team-members endpoint that does not exist (T-033).
 */
export function capacityEstimate(cycles: CycleDto[]): number | null {
  const closed = cycles
    .filter((c) => c.status === "completed")
    .sort((a, b) => (b.closedAt ?? b.endsAt) - (a.closedAt ?? a.endsAt))
    .slice(0, 3);
  if (closed.length === 0) return null;
  const sum = closed.reduce((acc, c) => acc + c.stats.completed.points, 0);
  return Math.round(sum / closed.length);
}

/** CY-08: completed cycles serve a snapshot frozen at close, labelled as of then. */
export function asOfCaption(cycle: CycleDto): string | null {
  if (cycle.status !== "completed") return null;
  const at = cycle.closedAt ?? cycle.endsAt;
  return `as of close ${new Date(at).toISOString().slice(0, 16).replace("T", " ")}`;
}

/** The current cycle of a team: the active one, else the soonest upcoming one. */
export function pickCurrent(cycles: CycleDto[]): CycleDto | null {
  const active = cycles.filter((c) => c.status === "active");
  if (active.length > 0) {
    return [...active].sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
  }
  const future = cycles.filter((c) => c.status === "future");
  if (future.length > 0) {
    return [...future].sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
  }
  return null;
}

/**
 * The cycle `closeCycle` would roll into: the earliest non-completed cycle
 * starting at or after this one ends. Null means the server will create one,
 * which it numbers `max(this + 1, highest + 1)`.
 */
export function rolloverTarget(cycle: CycleDto, cycles: CycleDto[]): CycleDto | null {
  return (
    [...cycles]
      .filter((c) => c.id !== cycle.id && c.status !== "completed" && c.startsAt >= cycle.endsAt)
      .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null
  );
}
