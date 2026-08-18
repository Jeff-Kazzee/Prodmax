/**
 * SB-05 Teams section: one expandable group per team (sidebar position
 * order). Expansion loads the team's workflow states (GET /api/teams/:id/states)
 * and links the team's live issue views (R-14 all/active/backlog — T-003)
 * plus new issue (R-15).
 */
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@island/components/ui/skeleton";
import type { Team, TeamState } from "./use-workspace-data";

const TEAM_VIEWS = [
  { segment: "all", label: "All issues" },
  { segment: "active", label: "Active" },
  { segment: "backlog", label: "Backlog" },
] as const;

function StateDot({ state }: { state: TeamState }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full border border-border"
      style={state.color ? { backgroundColor: state.color } : undefined}
      aria-hidden="true"
    />
  );
}

function TeamGroup({
  team,
  states,
  onExpand,
}: {
  team: Team;
  states: TeamState[] | undefined;
  onExpand: (teamId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) onExpand(team.id);
  };

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <span className="font-mono text-xs text-muted-foreground">{team.key}</span>
        <span className="min-w-0 flex-1 truncate">{team.name}</span>
      </button>
      {open ? (
        <ul className="ml-4 flex flex-col border-l border-border pl-1">
          {TEAM_VIEWS.map((view) => (
            <li key={view.segment}>
              <NavLink
                to={`/team/${team.key}/${view.segment}`}
                className={({ isActive }) =>
                  `flex h-8 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${isActive ? "bg-accent text-foreground" : ""}`
                }
              >
                {view.label}
              </NavLink>
            </li>
          ))}
          <li>
            <Link
              to={`/team/${team.key}/new`}
              className="flex h-8 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              New issue
            </Link>
          </li>
          <li aria-label="Workflow states" className="mt-1 flex flex-col">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Workflow
            </p>
            {states === undefined ? (
              <div className="flex flex-col gap-1 px-2 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ) : states.length === 0 ? (
              <p className="px-2 pb-2 text-xs text-muted-foreground">
                No workflow states.
              </p>
            ) : (
              <ul>
                {states.map((state) => (
                  <li
                    key={state.id}
                    className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground"
                  >
                    <StateDot state={state} />
                    <span className="truncate">{state.name}</span>
                    <span className="ml-auto font-mono text-[10px] opacity-70">
                      {state.category}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      ) : null}
    </li>
  );
}

export function TeamsSection({
  teams,
  error,
  statesByTeam,
  onExpand,
}: {
  teams: Team[] | null;
  error: string | null;
  statesByTeam: Record<string, TeamState[]>;
  onExpand: (teamId: string) => void;
}) {
  return (
    <section aria-label="Teams" className="flex flex-col">
      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Teams
      </p>
      {error ? (
        <p role="alert" className="px-2 pb-2 text-xs text-destructive">
          {error}
        </p>
      ) : teams === null ? (
        <div className="flex flex-col gap-2 px-2 pb-2" aria-hidden="true">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
        </div>
      ) : teams.length === 0 ? (
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          No teams in this workspace yet.
        </p>
      ) : (
        <ul>
          {teams.map((team) => (
            <TeamGroup
              key={team.id}
              team={team}
              states={statesByTeam[team.id]}
              onExpand={onExpand}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
