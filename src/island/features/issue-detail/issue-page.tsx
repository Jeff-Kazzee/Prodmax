/** R-11 full-page issue: same anatomy as the panel, centered w-720. */
import { useParams } from "react-router-dom";
import { useSession } from "@island/app/session";
import { IssueBody } from "./issue-body";

export function IssuePage() {
  const { identifier = "" } = useParams<{ identifier: string }>();
  const session = useSession();
  const wsId = session.activeWorkspace?.id ?? null;
  const userId = session.user?.id ?? "";
  if (!wsId) return null;
  return (
    <div className="mx-auto h-full w-full max-w-[720px] border-x bg-card" data-issue-page>
      <IssueBody wsId={wsId} userId={userId} identifier={identifier} variant="page" redirectedFrom={identifier} />
    </div>
  );
}
