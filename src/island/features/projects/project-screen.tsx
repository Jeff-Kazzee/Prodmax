/**
 * S-15 project screen. One component serves R-18 (`/project/:id`) and R-19
 * (`/project/:id/board` and `/list`).
 *
 * The Issues section renders `<IssueViewsScreen />` unchanged. That component
 * reads its own pathname, so `presetForPath`'s project branch still locks
 * `project eq :id` onto the view with no edit to the issues feature. Wrapping
 * it here is what gives R-19 the PJ-03 chrome it otherwise lacks.
 *
 * Overview, Milestones and Updates ride `?tab=` on R-18 rather than inventing
 * route ids the ux-spec §2 table does not define.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Skeleton } from "@island/components/ui/skeleton";
import { IssuesEmpty } from "@/components/issues/issues-empty";
import { useSession } from "@island/app/session";
import { toastApiError, toastOk } from "@island/app/toast";
import { IssueViewsScreen } from "@island/features/issues";
import { useLookups } from "@island/features/issues/use-lookups";
import { AddIssuesDialog } from "./add-issues-dialog";
import { trashProject } from "./api";
import { MilestonesTab } from "./tab-milestones";
import { OverviewTab } from "./tab-overview";
import { UpdatesTab } from "./tab-updates";
import { ProjectChrome, type ProjectSection } from "./project-chrome";
import { useProjectScreen } from "./use-projects";
import type { ProjectTab } from "./types";

/** Pathname decides Issues; `?tab=` decides the other three. */
export function sectionFor(pathname: string, tab: string | null): ProjectSection {
  if (/\/(board|list)$/.test(pathname)) return "issues";
  if (tab === "milestones" || tab === "updates") return tab as ProjectTab;
  return "overview";
}

export function ProjectScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const wsId = session.activeWorkspace?.id ?? null;
  const userId = session.user?.id ?? "";
  const section = sectionFor(pathname, params.get("tab"));
  const state = useProjectScreen(wsId, id);
  const { lookup, teams } = useLookups(wsId);
  const [addOpen, setAddOpen] = useState(false);

  /**
   * Re-read the project row whenever the reader lands on Overview.
   *
   * Completing an issue on the Issues tab moves `progress_cache` server-side,
   * and nothing tells this screen: the issue write path does not ring the
   * `onIssuesChanged` bus (see use-projects.ts). Without this the progress bar
   * shows a pre-completion percent until a hard reload. It is a single-row
   * read and it scans no issues, so the S-15 acceptance rule still holds.
   */
  useEffect(() => {
    if (section === "overview") void state.reloadProject();
    // Deliberately keyed on the section alone. Adding `state` would refire on
    // every render, since the hook returns a fresh object each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, id]);

  if (state.status === "missing") {
    return (
      // The server answers NOT_FOUND for a trashed project AND for one in
      // another workspace, so this cannot claim a deletion. Naming both is the
      // honest reading of what the client actually knows.
      <IssuesEmpty
        title="This project is not in this workspace."
        explainer="It was deleted, or it belongs to a workspace you have not switched to."
        actionLabel="All projects"
        onAction={() => navigate("/projects")}
      />
    );
  }

  if (state.status === "error") {
    return (
      <IssuesEmpty
        title="Something broke on our bench. It's been logged."
        explainer="The project did not load."
        actionLabel="Retry"
        onAction={() => void state.reloadProject()}
      />
    );
  }

  const project = state.project;
  if (state.status === "loading" || project === null) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Loading project">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const members = Object.values(lookup.members);
  const latestUpdate = state.updates[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-screen="Project">
      <ProjectChrome
        project={project}
        latestUpdate={latestUpdate}
        updatesFailed={state.updatesFailed}
        members={members}
        milestoneCount={state.milestones.length}
        updateCount={state.updates.length}
        active={section}
        onPatch={(body) => {
          void state.patchProject(body).catch(toastApiError);
        }}
        onTrash={() => {
          if (!wsId) return;
          void trashProject(wsId, project.id)
            .then(() => {
              toastOk("Project deleted", project.name);
              navigate("/projects");
            })
            .catch(toastApiError);
        }}
      />

      {section === "issues" ? (
        <div className="min-h-0 flex-1">
          <IssueViewsScreen />
        </div>
      ) : section === "milestones" ? (
        <MilestonesTab
          projectId={project.id}
          milestones={state.milestones}
          onCreate={state.createMilestone}
          onRename={state.renameMilestone}
          onTrash={state.trashMilestone}
        />
      ) : section === "updates" ? (
        <UpdatesTab
          updates={state.updates}
          members={members}
          currentUserId={userId}
          hasMore={state.updatesCursor !== null}
          onPost={state.postUpdate}
          onDelete={state.deleteUpdate}
          onLoadMore={state.loadMoreUpdates}
        />
      ) : (
        <OverviewTab
          project={project}
          milestones={state.milestones}
          latestUpdate={latestUpdate}
          updatesFailed={state.updatesFailed}
          milestonesFailed={state.milestonesFailed}
          authorName={latestUpdate ? (lookup.members[latestUpdate.authorId]?.name ?? null) : null}
          onAddIssues={() => setAddOpen(true)}
        />
      )}

      {/*
        Mounted only while open, and deliberately so. The picker searches with
        `useIssuesList`, which fetches on mount, and an always-mounted dialog
        would put an /api/issues request behind the Overview tab. Overview
        reading zero issues is the acceptance criterion for this screen.
      */}
      {wsId && addOpen ? (
        <AddIssuesDialog
          open
          onOpenChange={setAddOpen}
          wsId={wsId}
          projectId={project.id}
          teams={teams}
          onAttached={() => void state.reloadProject()}
        />
      ) : null}
    </div>
  );
}
