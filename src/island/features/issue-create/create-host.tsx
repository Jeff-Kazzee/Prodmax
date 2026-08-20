/**
 * Registers C/V via ShellState and mounts the new-issue modal.
 * Remount on each createRequest.id so prefill cannot clobber typed title.
 *
 * Opening from the URL needs an EXPLICIT intent, `?new`. It used to open
 * whenever `title`, `priority` or `team` appeared in the query string, and
 * this component is mounted by the shell, so that applied to every screen in
 * the app. `team` is not private to issue creation: ux-spec gives it to triage
 * for its team switcher (§4.14) and to the cycle header (§4.16 CY-01). The
 * result was that `/triage?team=PRO` opened a create form over the triage
 * screen, and because a modal marks the rest of the document `aria-hidden`,
 * the page the user actually asked for was removed from the accessibility
 * tree rather than merely covered. See T-033.
 *
 * The documented shareable create link is the R-15 route
 * `/team/:teamKey/new?title=…&priority=…`, which `NewIssueRoute` opens. It
 * reuses `urlPrefill` below so those parameters still land.
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSession } from "@island/app/session";
import { useShellState } from "@island/components/shell/shell-state";
import { useLookups } from "@island/features/issues/use-lookups";
import type { CreatePrefill } from "./commands";
import { loadDraft, loadLastTeamId } from "./draft";
import { NewIssueModal } from "./new-issue-modal";

/**
 * Read create prefill out of a query string. Shared with the R-15 route so
 * both entry points agree on what `?title=`, `?priority=` and `?team=` mean
 * once something has actually asked for the modal.
 */
export function urlPrefill(
  params: URLSearchParams,
  teams: Record<string, { id: string; key: string }>,
): CreatePrefill {
  const prefill: CreatePrefill = {};
  const title = params.get("title");
  const priority = params.get("priority");
  const team = params.get("team");
  if (title) prefill.title = title;
  if (priority != null && priority !== "") prefill.priority = Number(priority);
  if (team) {
    const match = Object.values(teams).find((t) => t.key === team || t.id === team);
    if (match) prefill.teamId = match.id;
  }
  return prefill;
}

export function IssueCreateHost() {
  const session = useSession();
  const wsId = session.activeWorkspace?.id ?? null;
  const { lookup, states, teams } = useLookups(wsId);
  const [params] = useSearchParams();
  const { createRequest, openNewIssue, closeCreate } = useShellState();
  const openedFromUrl = useRef(false);

  useEffect(() => {
    if (openedFromUrl.current) return;
    // Intent first. A prefill parameter is not a request to open anything.
    if (params.get("new") === null) return;
    openedFromUrl.current = true;
    openNewIssue(urlPrefill(params, lookup.teams));
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
