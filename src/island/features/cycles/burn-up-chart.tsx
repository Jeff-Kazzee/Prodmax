/**
 * CY-05 burn-up, hand-rolled inline SVG. dither-kit is not a dependency of
 * this repo and `src/components/charts` does not exist yet, so the wrapper
 * layer design-system §6.8 describes is not available to build against.
 *
 * The caption states what the scope line is, because it is the one place this
 * chart could mislead: no endpoint records when an issue entered a cycle, so
 * scope is drawn as today's total held flat, not as history.
 */
import { burnUpSeries } from "./cycle-stats";
import type { IssueListItem, LookupMaps } from "@island/features/issues/types";
import type { CycleDto } from "./types";

const W = 640;
const H = 160;
const PAD = { top: 8, right: 8, bottom: 20, left: 32 };

export function BurnUpChart({
  cycle,
  issues,
  lookup,
  now = Date.now(),
}: {
  cycle: CycleDto;
  issues: IssueListItem[];
  lookup: LookupMaps;
  now?: number;
}) {
  const { points, scope } = burnUpSeries(cycle, issues, lookup, now);
  const max = Math.max(scope, 1);
  const lastDay = points.length - 1;

  const x = (day: number): number =>
    PAD.left + (day / Math.max(1, lastDay)) * (W - PAD.left - PAD.right);
  const y = (value: number): number =>
    H - PAD.bottom - (value / max) * (H - PAD.top - PAD.bottom);

  const line = (pick: (p: (typeof points)[number]) => number): string =>
    points
      .map((p) => ({ px: x(p.day), py: y(pick(p)) }))
      .filter((p) => Number.isFinite(p.py))
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`)
      .join(" ");

  const completedPath = line((p) => p.completed);
  const idealPath = line((p) => p.ideal);

  return (
    <section aria-label="Scope chart" className="border-b px-4 py-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Scope chart
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-40 w-full"
        role="img"
        aria-label={`Burn-up: ${cycle.stats.completed.points} of ${scope} points completed`}
        data-testid="cy-burnup"
      >
        <line
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - PAD.right}
          y2={H - PAD.bottom}
          className="stroke-border"
          strokeWidth={1}
        />
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={H - PAD.bottom}
          className="stroke-border"
          strokeWidth={1}
        />
        {/* Scope: a level reference, not a series. See the caption. */}
        <line
          x1={PAD.left}
          y1={y(scope)}
          x2={W - PAD.right}
          y2={y(scope)}
          className="stroke-muted-foreground"
          strokeWidth={1.5}
        />
        <path d={idealPath} fill="none" className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="4 3" />
        <path d={completedPath} fill="none" className="stroke-primary" strokeWidth={1.5} />
        <text x={PAD.left} y={H - 6} className="fill-muted-foreground" fontSize={10}>
          day 0
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
          day {lastDay}
        </text>
      </svg>
      <p className="font-mono text-xs text-muted-foreground">
        completed {cycle.stats.completed.points} pts · scope {scope} pts · ideal dashed
      </p>
      <p className="text-xs text-muted-foreground">
        Scope is drawn flat at today's total. Nothing records when an issue entered the cycle, so
        this chart does not claim a scope history.
      </p>
    </section>
  );
}
