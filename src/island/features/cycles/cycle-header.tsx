/**
 * CY-01/CY-02/CY-08/CY-09 cycle header.
 *
 * A completed cycle offers no Close control, because the server answers a
 * second close with 409, and it carries the "as of close" caption instead: its
 * numbers are the snapshot frozen at close, never a recomputation (FM-033).
 */
import { Link } from "react-router-dom";
import { Button } from "@island/components/ui/button";
import { ProgressBar } from "@island/features/projects/progress-bar";
import { asOfCaption, capacityEstimate, dayXofY } from "./cycle-stats";
import { cycleName, type CycleDto, type CycleTeam } from "./types";

function percentOf(cycle: CycleDto): number {
  const { scope, completed } = cycle.stats;
  if (scope.issues === 0) return 0;
  return Math.round((100 * completed.issues) / scope.issues);
}

export function CycleHeader({
  cycle,
  team,
  eligible,
  cycles,
  onTeam,
  onClose,
  now = Date.now(),
}: {
  cycle: CycleDto;
  team: CycleTeam | null;
  eligible: CycleTeam[];
  cycles: CycleDto[];
  onTeam: (key: string) => void;
  onClose: () => void;
  now?: number;
}) {
  const { day, total } = dayXofY(cycle, now);
  const capacity = capacityEstimate(cycles);
  const asOf = asOfCaption(cycle);
  const over = capacity !== null ? cycle.stats.scope.points - capacity.points : 0;
  const others = cycles.filter((c) => c.id !== cycle.id);

  return (
    <header className="flex flex-col gap-3 border-b px-4 py-3" data-screen-header="cycle">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{cycleName(cycle)}</h1>
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(cycle.startsAt).toISOString().slice(0, 10)} →{" "}
          {new Date(cycle.endsAt).toISOString().slice(0, 10)}
        </span>
        {cycle.status === "completed" ? (
          <span className="rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground">
            Completed
          </span>
        ) : (
          <span className="font-mono text-xs text-muted-foreground" data-testid="cy-day">
            day {day}/{total}
          </span>
        )}

        {eligible.length > 1 ? (
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">Team</span>
            <select
              aria-label="Cycle team"
              className="h-7 rounded-md border bg-transparent px-1 text-xs"
              value={team?.key ?? ""}
              onChange={(e) => onTeam(e.target.value)}
            >
              {eligible.map((t) => (
                <option key={t.id} value={t.key}>
                  {t.key}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {team && team.autoAddToCycle === 1 ? (
          <span className="rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground">
            Auto-add in progress: on
          </span>
        ) : null}

        {/*
          Only a running cycle can be closed. The server rejects a second close
          on a completed one with 409, and it ACCEPTS a close on a future one,
          which would freeze empty stats and auto-create a successor for a
          cycle that never ran. Offering the button there is offering a mistake.
        */}
        {cycle.status === "active" ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onClose}>
            Close cycle
          </Button>
        ) : null}
      </div>

      <ProgressBar
        label={`${cycleName(cycle)} progress`}
        percent={percentOf(cycle)}
        points={{
          done: cycle.stats.completed.points,
          total: cycle.stats.scope.points,
          issuesDone: cycle.stats.completed.issues,
          issuesTotal: cycle.stats.scope.issues,
        }}
      />

      {asOf ? (
        <p className="font-mono text-xs text-muted-foreground" data-testid="cy-asof">
          {asOf}
        </p>
      ) : capacity !== null ? (
        <p className="font-mono text-xs text-muted-foreground" data-testid="cy-capacity">
          capacity est {capacity.points} pts (mean of last {capacity.sample}) · scoped{" "}
          {cycle.stats.scope.points} pts
          {over > 0 ? (
            <span className="text-amber-500">
              {" "}
              <span aria-hidden="true">⚠</span> over by {over}
            </span>
          ) : null}
        </p>
      ) : null}

      {others.length > 0 ? (
        <nav aria-label="Cycle history" className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            History
          </span>
          {others.map((c) => (
            <Link
              key={c.id}
              to={`/cycle/${c.id}${team ? `?cycleTeam=${encodeURIComponent(team.key)}` : ""}`}
              className="rounded-sm border px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {cycleName(c)}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
