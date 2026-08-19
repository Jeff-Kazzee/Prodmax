/** R-15 `/team/:teamKey/new` opens the create modal, then the team view. */
import { useEffect, useRef } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useSession } from "@island/app/session";
import { useShellState } from "@island/components/shell/shell-state";
import { useLookups } from "@island/features/issues/use-lookups";
import { urlPrefill } from "./create-host";

export function NewIssueRoute() {
  const { teamKey = "" } = useParams<{ teamKey: string }>();
  const [params] = useSearchParams();
  const { openNewIssue } = useShellState();
  const { lookup } = useLookups(useSession().activeWorkspace?.id ?? null);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    // The route IS the intent here, so `?title=` and `?priority=` are prefill
    // rather than a trigger. The team comes from the path and wins.
    openNewIssue({ ...urlPrefill(params, lookup.teams), teamKey });
  }, [teamKey, params, lookup.teams, openNewIssue]);
  return <Navigate to={`/team/${teamKey}/all`} replace />;
}
