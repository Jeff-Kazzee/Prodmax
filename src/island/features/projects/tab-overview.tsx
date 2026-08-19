/**
 * PJ-04/PJ-05/PJ-06/PJ-07 overview tab.
 *
 * Everything here reads the project's materialized counters and the
 * already-loaded milestone and update lists. This tab issues NO issue query,
 * which is the acceptance criterion for S-15: progress is a cache read, never
 * a scan (architecture §9).
 *
 * Two PJ-06 elements are absent because no honest source exists for them at
 * this layer. The blocked count has no field or aggregate anywhere in the API,
 * and the 8-week sparkline needs a time series no endpoint serves. Deriving
 * either on the client means scanning issues, which is exactly what this tab
 * must not do. See T-031.
 */
import { Link } from "react-router-dom";
import { Button } from "@island/components/ui/button";
import { renderMarkdown } from "@island/features/issue-detail/markdown";
import { progressLabelParts } from "./progress-bar";
import { HEALTH_LABELS, type MilestoneDto, type ProjectDto, type ProjectUpdateDto } from "./types";

function relativeDay(ts: number, now: number): string {
  const days = Math.round((now - ts) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function milestonePercent(milestone: MilestoneDto): number {
  const { total, completed } = milestone.progress;
  if (total === 0) return 0;
  return Math.round((100 * completed) / total);
}

/** The next milestone is the earliest dated one that is not fully complete. */
export function nextMilestone(milestones: MilestoneDto[]): MilestoneDto | null {
  const open = milestones.filter((m) => m.progress.completed < m.progress.total || m.progress.total === 0);
  const dated = open.filter((m) => m.targetDate !== null);
  if (dated.length > 0) {
    return [...dated].sort((a, b) => (a.targetDate ?? "").localeCompare(b.targetDate ?? ""))[0] ?? null;
  }
  return open[0] ?? null;
}

/**
 * PJ-05 stale indicator: the cadence has elapsed plus three days of grace.
 * Returns null when the cadence is off, which is the default.
 */
export function updateOverdue(project: ProjectDto, now: number): boolean {
  const days: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14 };
  const period = days[project.updateCadence];
  if (period === undefined) return false;
  const since = project.lastUpdateAt ?? project.createdAt;
  return now - since > (period + 3) * 86_400_000;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function OverviewTab({
  project,
  milestones,
  latestUpdate,
  updatesFailed,
  milestonesFailed,
  authorName,
  onAddIssues,
  now = Date.now(),
}: {
  project: ProjectDto;
  milestones: MilestoneDto[];
  latestUpdate: ProjectUpdateDto | null;
  updatesFailed: boolean;
  milestonesFailed: boolean;
  authorName: string | null;
  onAddIssues: () => void;
  now?: number;
}) {
  const next = nextMilestone(milestones);
  const points = project.progressPoints;
  const parts = progressLabelParts(project.progressCache, points);
  const overdue = updateOverdue(project, now);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-tab="overview">
      <Section title="Milestones">
        {milestonesFailed ? (
          <p className="text-sm text-destructive">Milestones did not load.</p>
        ) : milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones yet.</p>
        ) : (
          <p className="text-sm">
            {next ? (
              <>
                <span className="text-muted-foreground">Next: </span>
                <span className="font-medium">{next.name}</span>
                {next.targetDate ? (
                  <span className="font-mono text-xs text-muted-foreground"> · {next.targetDate}</span>
                ) : null}
                <span className="font-mono text-xs text-muted-foreground">
                  {" "}
                  · {milestonePercent(next)}%
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Every milestone is complete.</span>
            )}
            <Link
              to={`/project/${project.id}?tab=milestones`}
              className="ml-2 text-xs underline-offset-4 hover:underline"
            >
              All {milestones.length}
            </Link>
          </p>
        )}
      </Section>

      <Section title="Updates">
        {latestUpdate ? (
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{HEALTH_LABELS[latestUpdate.health]}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {authorName ?? "Someone"} · {relativeDay(latestUpdate.createdAt, now)}
                {latestUpdate.progressSnapshot !== null
                  ? ` · ${latestUpdate.progressSnapshot}% at post`
                  : ""}
              </span>
            </p>
            <div
              className="text-sm text-muted-foreground"
              // Same escaped-then-marked renderer the issue description uses.
              dangerouslySetInnerHTML={{ __html: renderMarkdown(latestUpdate.bodyMd) }}
            />
          </div>
        ) : updatesFailed ? (
          <p className="text-sm text-destructive">Updates did not load.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No updates posted yet.</p>
        )}
        {overdue ? (
          <p className="text-xs text-amber-500">
            <span aria-hidden="true">⚠ </span>
            Update missing. This project reports {project.updateCadence}.
          </p>
        ) : null}
        <div>
          <Link
            to={`/project/${project.id}?tab=updates`}
            className="text-xs underline-offset-4 hover:underline"
          >
            Post an update
          </Link>
        </div>
      </Section>

      <Section title="Stats">
        {points === null ? (
          <p className="text-sm text-muted-foreground">
            Counts unavailable. This project's stored progress cache predates the current shape.
          </p>
        ) : (
          <p className="flex flex-wrap gap-3 font-mono text-sm tabular-nums">
            <span>{points.issuesTotal - points.issuesDone} open</span>
            <span>{points.issuesDone} done</span>
            {parts.points ? <span>{parts.points}</span> : null}
          </p>
        )}
        {points !== null && points.issuesTotal === 0 ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">No issues in this project.</p>
            <Button size="xs" variant="outline" onClick={onAddIssues}>
              Add issues
            </Button>
          </div>
        ) : (
          <div>
            <Button size="xs" variant="outline" onClick={onAddIssues}>
              Add issues
            </Button>
          </div>
        )}
      </Section>

      <Section title="Brief">
        {project.briefPageId ? (
          <Link
            to={`/docs/page/${project.briefPageId}`}
            className="text-sm underline-offset-4 hover:underline"
          >
            Open the project brief
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            No brief linked. Docs ship in M5, and a brief is a Prodmax page like any other.
          </p>
        )}
      </Section>
    </div>
  );
}
