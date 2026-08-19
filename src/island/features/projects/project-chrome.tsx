/**
 * PJ-01/PJ-02/PJ-03 project header and section nav, shared by R-18 and R-19.
 *
 * Every control here maps to a field `patchProjectSchema` accepts. PJ-01's
 * star is absent on purpose: favourites exist for saved views only, and there
 * is no project-favourite endpoint to wire a star to (T-029).
 *
 * The section nav is four links rather than a Radix Tabs widget, because two
 * of the four are real routes. Links with `aria-current` are the honest role
 * and they deep-link; a tablist would promise tabpanels that do not exist.
 */
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@island/components/ui/dropdown-menu";
import { Button } from "@island/components/ui/button";
import { cn } from "@/lib/utils";
import type { MemberOption } from "@island/features/issues/types";
import { ProgressBar } from "./progress-bar";
import {
  HEALTH_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type PatchProjectBody,
  type ProjectDto,
  type ProjectStatus,
  type ProjectUpdateDto,
} from "./types";

const HEALTH_CLASS: Record<string, string> = {
  on_track: "border-emerald-600/40 text-emerald-500",
  at_risk: "border-amber-600/40 text-amber-500",
  off_track: "border-destructive/40 text-destructive",
};

function HealthChip({ update }: { update: ProjectUpdateDto | null }) {
  if (!update) {
    return (
      <span
        className="rounded-sm border px-1.5 py-0.5 text-xs text-muted-foreground"
        data-testid="pj-health-chip"
      >
        No update yet
      </span>
    );
  }
  return (
    <span
      className={cn("rounded-sm border px-1.5 py-0.5 text-xs", HEALTH_CLASS[update.health])}
      data-testid="pj-health-chip"
    >
      {HEALTH_LABELS[update.health]}
    </span>
  );
}

export type ProjectSection = "overview" | "issues" | "milestones" | "updates";

export function ProjectChrome({
  project,
  latestUpdate,
  members,
  milestoneCount,
  updateCount,
  active,
  onPatch,
  onTrash,
}: {
  project: ProjectDto;
  latestUpdate: ProjectUpdateDto | null;
  members: MemberOption[];
  milestoneCount: number;
  updateCount: number;
  active: ProjectSection;
  onPatch: (body: PatchProjectBody) => void;
  onTrash: () => void;
}) {
  const issueCount = project.progressPoints?.issuesTotal ?? null;
  const link = (section: ProjectSection, to: string, label: string, count: number | null) => (
    // A plain Link, not a NavLink: three of the four targets differ only by
    // `?tab=`, which NavLink's own active matching ignores. `active` is
    // resolved by the screen from pathname plus search, so it is the truth.
    <Link
      key={section}
      to={to}
      aria-current={active === section ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
        active === section && "bg-accent text-foreground",
      )}
    >
      {label}
      {count !== null ? <span className="font-mono text-xs opacity-70">{count}</span> : null}
    </Link>
  );

  return (
    <header className="flex flex-col gap-3 border-b px-4 py-3" data-screen-header="project">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-xs">
          <span className="sr-only">Project status</span>
          <select
            aria-label="Project status"
            className="h-7 rounded-md border bg-transparent px-1 text-xs"
            value={project.status}
            onChange={(e) => onPatch({ status: e.target.value as ProjectStatus })}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{project.name}</h1>

        <HealthChip update={latestUpdate} />

        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Lead</span>
          <select
            aria-label="Project lead"
            className="h-7 rounded-md border bg-transparent px-1 text-xs"
            value={project.leadId ?? ""}
            onChange={(e) => onPatch({ leadId: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Start</span>
          <input
            type="date"
            aria-label="Target start date"
            className="h-7 rounded-md border bg-transparent px-1 text-xs"
            value={project.targetStartDate ?? ""}
            onChange={(e) => onPatch({ targetStartDate: e.target.value || null })}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Target</span>
          <input
            type="date"
            aria-label="Target end date"
            className="h-7 rounded-md border bg-transparent px-1 text-xs"
            value={project.targetEndDate ?? ""}
            onChange={(e) => onPatch({ targetEndDate: e.target.value || null })}
          />
        </label>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                <span aria-hidden="true">⋯</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard.writeText(window.location.href);
                }}
              >
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onPatch({ archived: project.archivedAt === null })}
              >
                {project.archivedAt === null ? "Archive" : "Unarchive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onTrash}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ProgressBar
        label="Project progress"
        percent={project.progressCache}
        points={project.progressPoints}
      />

      <nav aria-label="Project sections" className="flex flex-wrap items-center gap-1">
        {link("overview", `/project/${project.id}`, "Overview", null)}
        {link("issues", `/project/${project.id}/list`, "Issues", issueCount)}
        {link("milestones", `/project/${project.id}?tab=milestones`, "Milestones", milestoneCount)}
        {link("updates", `/project/${project.id}?tab=updates`, "Updates", updateCount)}
        {project.briefPageId ? (
          <Link
            to={`/docs/page/${project.briefPageId}`}
            className="ml-2 flex h-8 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Brief
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
