/**
 * S-16 data hooks.
 *
 * Team resolution is the awkward part and it is inherent, not incidental:
 * `GET /api/cycles` requires a `teamId`, `/cycle/current` carries no team, and
 * there is no `GET /api/cycles/:id`. So `?team=` is the source of truth when
 * present, the first cycles-enabled team is the default, and a bare
 * `/cycle/:id` falls back to a bounded fan-out across eligible teams to find
 * which one owns that cycle.
 */
import { useCallback, useEffect, useState } from "react";
import { onIssuesChanged } from "@island/features/issue-create/commands";
import { listCycles, listTeams } from "./api";
import { pickCurrent } from "./cycle-stats";
import type { CycleDto, CycleTeam } from "./types";

export type CycleLoadStatus = "loading" | "ready" | "no-teams" | "no-cycle" | "error";

export interface CyclesState {
  eligible: CycleTeam[];
  team: CycleTeam | null;
  cycles: CycleDto[];
  cycle: CycleDto | null;
  status: CycleLoadStatus;
  reload: () => void;
}

/** Teams with cycles turned on, in sidebar position order. */
function eligibleTeams(teams: CycleTeam[]): CycleTeam[] {
  return teams
    .filter((t) => t.cyclesEnabled === 1)
    .sort((a, b) => a.position.localeCompare(b.position));
}

export function useCycles(
  wsId: string | null,
  opts: { cycleId: string | null; teamKey: string | null },
): CyclesState {
  const { cycleId, teamKey } = opts;
  const [eligible, setEligible] = useState<CycleTeam[]>([]);
  const [team, setTeam] = useState<CycleTeam | null>(null);
  const [cycles, setCycles] = useState<CycleDto[]>([]);
  const [cycle, setCycle] = useState<CycleDto | null>(null);
  const [status, setStatus] = useState<CycleLoadStatus>("loading");

  const load = useCallback(async () => {
    if (!wsId) return;
    setStatus("loading");
    let teams: CycleTeam[];
    try {
      teams = eligibleTeams((await listTeams(wsId)).data);
    } catch {
      setStatus("error");
      return;
    }
    setEligible(teams);
    if (teams.length === 0) {
      setStatus("no-teams");
      return;
    }

    const requested = teamKey ? (teams.find((t) => t.key === teamKey) ?? null) : null;

    // R-21 without ?team=: the cycle id alone does not say which team owns it,
    // and no single-cycle GET exists, so ask each eligible team once.
    if (cycleId && !requested) {
      try {
        const pages = await Promise.all(teams.map((t) => listCycles(wsId, t.id)));
        for (let i = 0; i < teams.length; i++) {
          const found = (pages[i]?.data ?? []).find((c) => c.id === cycleId);
          if (found) {
            setTeam(teams[i] ?? null);
            setCycles(pages[i]?.data ?? []);
            setCycle(found);
            setStatus("ready");
            return;
          }
        }
        setTeam(teams[0] ?? null);
        setCycles(pages[0]?.data ?? []);
        setCycle(null);
        setStatus("no-cycle");
      } catch {
        setStatus("error");
      }
      return;
    }

    const target = requested ?? teams[0];
    if (!target) {
      setStatus("no-teams");
      return;
    }
    setTeam(target);
    try {
      const page = await listCycles(wsId, target.id);
      setCycles(page.data);
      const focused = cycleId
        ? (page.data.find((c) => c.id === cycleId) ?? null)
        : pickCurrent(page.data);
      setCycle(focused);
      setStatus(focused ? "ready" : "no-cycle");
    } catch {
      setStatus("error");
    }
  }, [wsId, cycleId, teamKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Scoping and state changes both move cycle stats, which are computed
  // server-side over live issues while a cycle runs.
  useEffect(() => {
    return onIssuesChanged(() => void load());
  }, [load]);

  return { eligible, team, cycles, cycle, status, reload: () => void load() };
}

/** Filter for the issues scoped to one cycle. */
export function scopeFilter(cycleId: string) {
  return { combinator: "and" as const, children: [{ field: "cycle" as const, op: "eq" as const, value: cycleId }] };
}

/**
 * Filter for a team's open issues.
 *
 * It cannot ask for "unscoped" directly: the filter DSL has no null predicate,
 * and `cycle nin [...]` compiles to `cycle_id NOT IN (...)`, which SQL
 * evaluates as NULL for a NULL column and therefore drops exactly the rows the
 * backlog drawer wants. The `cycleId === null` pass happens on the client.
 */
export function backlogFilter(teamId: string) {
  return {
    combinator: "and" as const,
    children: [
      { field: "team" as const, op: "eq" as const, value: teamId },
      { field: "statusCategory" as const, op: "nin" as const, value: ["completed", "canceled"] },
    ],
  };
}
