/**
 * Registers C/V via ShellState and mounts the new-issue modal.
 * Remount on each createRequest.id so prefill cannot clobber typed title.
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSession } from "@island/app/session";
import { useShellState } from "@island/components/shell/shell-state";
import { useLookups } from "@island/features/issues/use-lookups";
import type { CreatePrefill } from "./commands";
import { loadDraft, loadLastTeamId } from "./draft";
import { NewIssueModal } from "./new-issue-modal";

export function IssueCreateHost() {
  const session = useSession();
  const wsId = session.activeWorkspace?.id ?? null;
  const { lookup, states, teams } = useLookups(wsId);
  const [params] = useSearchParams();
  const { createRequest, openNewIssue, closeCreate } = useShellState();
  const openedFromUrl = useRef(false);

  useEffect(() => {
    if (openedFromUrl.current) return;
    const urlPrefill: CreatePrefill = {};
    const title = params.get("title");
    const priority = params.get("priority");
    const team = params.get("team");
    if (title) urlPrefill.title = title;
    if (priority != null && priority !== "") urlPrefill.priority = Number(priority);
    if (team) {
      const match = Object.values(lookup.teams).find((t) => t.key === team || t.id === team);
      if (match) urlPrefill.teamId = match.id;
    }
    if (urlPrefill.title || urlPrefill.priority != null || urlPrefill.teamId) {
      openedFromUrl.current = true;
      openNewIssue(urlPrefill);
    }
  }, [params, lookup.teams, openNewIssue]);

  if (!wsId || !createRequest) return null;
  const lastTeam = loadLastTeamId(wsId);
  const fromKey = createRequest.prefill.teamKey
    ? teams.find((t) => t.key === createRequest.prefill.teamKey)?.id
    : undefined;
  const prefill: CreatePrefill = {
    ...createRequest.prefill,
    teamId: createRequest.prefill.teamId ?? fromKey ?? lastTeam ?? undefined,
  };
  return (
    <NewIssueModal
      key={createRequest.id}
      open
      full={createRequest.full}
      wsId={wsId}
      teams={teams}
      states={states}
      prefill={prefill}
      initial={loadDraft(wsId)}
      onOpenChange={(next) => {
        if (!next) closeCreate();
      }}
    />
  );
}
