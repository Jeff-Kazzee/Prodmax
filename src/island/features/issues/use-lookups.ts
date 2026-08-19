/** Load teams/states/labels/members once per workspace for grouping + chips. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { listLabels, listMembers, listTeamStates, listTeams } from "./api";
import type { LabelOption, LookupMaps, MemberOption, StateOption, TeamOption } from "./types";

export function useLookups(wsId: string | null) {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);

  const reload = useCallback(async () => {
    if (!wsId) return;
    try {
      const [teamPage, labelPage, memberPage] = await Promise.all([
        listTeams(wsId),
        listLabels(wsId),
        listMembers(wsId),
      ]);
      const teamList = teamPage.data.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        triageEnabled: t.triageEnabled,
      }));
      setTeams(teamList);
      setLabels(labelPage.data);
      setMembers(memberPage.data);
      const statePages = await Promise.all(teamList.map((t) => listTeamStates(t.id)));
      setStates(statePages.flatMap((p) => p.data));
    } catch {
      setTeams([]);
      setStates([]);
      setLabels([]);
      setMembers([]);
    }
  }, [wsId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const lookup = useMemo<LookupMaps>(() => {
    const maps: LookupMaps = { states: {}, teams: {}, members: {}, labels: {} };
    for (const s of states) maps.states[s.id] = s;
    for (const t of teams) maps.teams[t.id] = t;
    for (const m of members) maps.members[m.userId] = m;
    for (const l of labels) maps.labels[l.id] = l;
    return maps;
  }, [states, teams, labels, members]);

  const teamIdByKey = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of teams) out[t.key] = t.id;
    return out;
  }, [teams]);

  return { lookup, teams, states, teamIdByKey, reload };
}
