/**
 * Workspace-scoped shell data (SB-01/SB-05): teams for the active
 * workspace plus per-team workflow states, refetched whenever the
 * active workspace changes (wsEpoch from the session store).
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@island/app/api";
import { useSession } from "@island/app/session";

export interface Team {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string | null;
  timezone: string | null;
  position: string;
  triageEnabled: number;
  cyclesEnabled: number;
}

export interface TeamState {
  id: string;
  teamId: string;
  name: string;
  category: string;
  position: string;
  color: string | null;
}

interface ListResponse<T> {
  data: T[];
}

export function useTeamsData() {
  const { activeWorkspace, wsEpoch } = useSession();
  const wsId = activeWorkspace?.id ?? null;
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statesByTeam, setStatesByTeam] = useState<Record<string, TeamState[]>>({});

  const loadTeams = useCallback(async () => {
    if (!wsId) return;
    setTeams(null);
    setError(null);
    try {
      const res = await apiGet<ListResponse<Team>>(`/api/teams?wsId=${encodeURIComponent(wsId)}`);
      setTeams(
        [...res.data].sort((a, b) => a.position.localeCompare(b.position)),
      );
    } catch {
      setError("Teams didn't load.");
    }
  }, [wsId]);

  useEffect(() => {
    void loadTeams();
    setStatesByTeam({});
  }, [loadTeams, wsEpoch]);

  /** Fetch a team's workflow states once (SB-05 expansion). */
  const loadStates = useCallback(
    async (teamId: string) => {
      if (statesByTeam[teamId]) return;
      try {
        const res = await apiGet<ListResponse<TeamState>>(
          `/api/teams/${encodeURIComponent(teamId)}/states`,
        );
        setStatesByTeam((prev) => ({ ...prev, [teamId]: res.data }));
      } catch {
        setStatesByTeam((prev) => ({ ...prev, [teamId]: [] }));
      }
    },
    [statesByTeam],
  );

  return { teams, error, statesByTeam, loadStates, reload: loadTeams };
}
