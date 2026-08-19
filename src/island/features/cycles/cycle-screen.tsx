/**
 * S-16 cycle screen. One component serves R-20 (`/cycle/current`) and R-21
 * (`/cycle/:id`); the route only decides whether a cycle id is supplied.
 *
 * CY-04 asks for the S-08 board engine scoped to the cycle. That engine picks
 * its filter from the pathname, and `/cycle/current` carries no cycle id to
 * pick, so locking it would mean editing `presets.ts` outside this ticket's
 * owns list. Scoped issues render here instead, with a board link that carries
 * the same filter explicitly. See T-030.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Skeleton } from "@island/components/ui/skeleton";
import { IssuesEmpty } from "@/components/issues/issues-empty";
import { useSession } from "@island/app/session";
import { toastApiError } from "@island/app/toast";
import { notifyIssuesChanged } from "@island/features/issue-create/commands";
import { useIssuesList } from "@island/features/issues/use-issues";
import { useLookups } from "@island/features/issues/use-lookups";
import { BurnUpChart } from "./burn-up-chart";
import { CloseCycleDialog } from "./close-cycle-dialog";
import { CycleHeader } from "./cycle-header";
import { ScopePanel } from "./scope-panel";
import { closeCycle, scopeCycle } from "./api";
import { backlogFilter, scopeFilter, useCycles } from "./use-cycles";

export function CycleScreen() {
  const { id } = useParams<{ id?: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const wsId = session.activeWorkspace?.id ?? null;
  const cycleId = id ?? null;
  const state = useCycles(wsId, { cycleId, teamKey: params.get("team") });
  const { lookup } = useLookups(wsId);
  const [closeOpen, setCloseOpen] = useState(false);

  const cycle = state.cycle;
  const scopeFilters = useMemo(
    () => (cycle ? scopeFilter(cycle.id) : { combinator: "and" as const, children: [] }),
    [cycle],
  );
  const backlogFilters = useMemo(
    () => (state.team ? backlogFilter(state.team.id) : { combinator: "and" as const, children: [] }),
    [state.team],
  );
  const scopedList = useIssuesList({ wsId, filters: scopeFilters, sort: "updated:desc" });
  const backlogList = useIssuesList({ wsId, filters: backlogFilters, sort: "updated:desc" });

  // The DSL has no null predicate, so "unscoped" is a client-side pass.
  const backlog = useMemo(
    () => backlogList.items.filter((i) => i.cycleId === null),
    [backlogList.items],
  );

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Loading cycle">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <IssuesEmpty
        title="Something broke on our bench. It's been logged."
        explainer="The cycle did not load."
        actionLabel="Retry"
        onAction={state.reload}
      />
    );
  }

  if (state.status === "no-teams") {
    return (
      <IssuesEmpty
        title="No active cycle"
        explainer="No team you can see has cycles enabled. Turn them on in team settings."
        actionLabel="Team settings"
        onAction={() => navigate("/settings/teams")}
      />
    );
  }

  if (state.status === "no-cycle" || cycle === null) {
    return (
      <IssuesEmpty
        title="No active cycle"
        explainer={
          state.team
            ? `${state.team.key} has no cycle running or scheduled.`
            : "This team has no cycle running or scheduled."
        }
        actionLabel="Team settings"
        onAction={() => navigate("/settings/teams")}
      />
    );
  }

  const boardFilter = encodeURIComponent(JSON.stringify(scopeFilters));

  return (
    <div className="flex h-full min-h-0 flex-col" data-screen="Cycle">
      <CycleHeader
        cycle={cycle}
        team={state.team}
        eligible={state.eligible}
        cycles={state.cycles}
        onTeam={(key) => {
          // Team is a URL fact so the choice survives a reload and a share.
          const next = new URLSearchParams(params);
          next.set("team", key);
          setParams(next, { replace: true });
          if (cycleId) navigate(`/cycle/current?team=${encodeURIComponent(key)}`);
        }}
        onClose={() => setCloseOpen(true)}
      />

      <BurnUpChart cycle={cycle} issues={scopedList.items} lookup={lookup} />

      <div className="px-4 pt-2">
        <Link
          to={`/issues/board?f=${boardFilter}`}
          className="text-xs underline-offset-4 hover:underline"
        >
          Open this cycle on the board
        </Link>
      </div>

      <ScopePanel
        cycle={cycle}
        scoped={scopedList.items}
        backlog={backlog}
        lookup={lookup}
        onScope={async (body) => {
          if (!wsId) throw new Error("No active workspace");
          try {
            const res = await scopeCycle(wsId, cycle.id, body);
            // One bus notification refreshes every mounted issue list plus the
            // cycle stats, which the server recomputes over live issues.
            notifyIssuesChanged();
            return res.scope;
          } catch (err) {
            toastApiError(err);
            throw err;
          }
        }}
      />

      <CloseCycleDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        cycle={cycle}
        cycles={state.cycles}
        scoped={scopedList.items}
        scopedTruncated={scopedList.nextCursor !== null}
        lookup={lookup}
        onConfirm={async () => {
          if (!wsId) throw new Error("No active workspace");
          return closeCycle(wsId, cycle.id);
        }}
        onClosed={(nextCycleId) => {
          notifyIssuesChanged();
          const team = state.team ? `?team=${encodeURIComponent(state.team.key)}` : "";
          navigate(`/cycle/${nextCycleId}${team}`);
        }}
      />
    </div>
  );
}
