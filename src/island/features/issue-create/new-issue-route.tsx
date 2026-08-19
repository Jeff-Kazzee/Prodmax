/** R-15 `/team/:teamKey/new` opens the create modal, then the team view. */
import { useEffect, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useShellState } from "@island/components/shell/shell-state";

export function NewIssueRoute() {
  const { teamKey = "" } = useParams<{ teamKey: string }>();
  const { openNewIssue } = useShellState();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    openNewIssue({ teamKey });
  }, [teamKey, openNewIssue]);
  return <Navigate to={`/team/${teamKey}/all`} replace />;
}
