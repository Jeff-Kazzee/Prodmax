/**
 * PJ-02 ProgressBar (design-system §43): h-4 track, determinate only, mono
 * label row.
 *
 * The percent shown is ALWAYS the server's materialized `progress_cache`
 * (§9). This component never derives a percent from the counts, because the
 * two can legitimately disagree: the stored percent is issue-based while the
 * points pair is estimate-based.
 *
 * When `points` is null the stored cache is legacy or malformed and the counts
 * are genuinely unknown, so the label says so instead of printing "0/0", which
 * would claim an empty project. That case is live today: the demo seed writes
 * the legacy two-field shape (T-025).
 */
import { cn } from "@/lib/utils";
import type { ProgressPoints } from "./types";

export interface ProgressLabelParts {
  percent: string;
  issues: string | null;
  points: string | null;
  /** True when the counts are unknown rather than zero. */
  degraded: boolean;
}

export function progressLabelParts(
  percent: number,
  points: ProgressPoints | null,
): ProgressLabelParts {
  const pct = `${clampPercent(percent)}%`;
  if (points === null) {
    return { percent: pct, issues: null, points: null, degraded: true };
  }
  return {
    percent: pct,
    issues: `${points.issuesDone}/${points.issuesTotal} issues`,
    // An unestimated project has a real zero total; saying "0/0 pts" there is
    // accurate, but it is noise, so the points segment drops out instead.
    points: points.total === 0 ? null : `${points.done}/${points.total} pts`,
    degraded: false,
  };
}

export function progressLabel(percent: number, points: ProgressPoints | null): string {
  const parts = progressLabelParts(percent, points);
  if (parts.degraded) return `${parts.percent} · counts unavailable`;
  return [parts.percent, parts.issues, parts.points].filter(Boolean).join(" · ");
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function ProgressBar({
  percent,
  points,
  label,
  overdue = false,
  size = "md",
  className,
}: {
  percent: number;
  points: ProgressPoints | null;
  /** Accessible name, since several bars can share a screen. */
  label: string;
  overdue?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const value = clampPercent(percent);
  const text = progressLabel(percent, points);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={text}
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-4",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            overdue ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <p
        className="font-mono text-xs tabular-nums text-muted-foreground"
        data-testid="pj-progress-label"
      >
        {text}
      </p>
    </div>
  );
}
