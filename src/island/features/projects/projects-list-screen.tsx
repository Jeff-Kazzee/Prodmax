/**
 * S-15 project list (R-17): rows grouped by status, each with a progress bar
 * read from the materialized cache. Rows keep the server's fractional
 * position order inside a group.
 *
 * Rows drag to reorder within their status group. The drop writes a fractional
 * midpoint key through `PATCH /api/projects/:id {position}`, so no sibling row
 * is rewritten (T-028). Dragging across groups is not a reorder and is
 * ignored: the status select is how a project changes status, and inferring a
 * status change from a drop would make one gesture mean two things.
 *
 * `data-screen="Projects"` and the "Projects" heading are load-bearing:
 * tests/e2e/shell.spec.ts asserts both on this route.
 */
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@island/components/ui/button";
import { Skeleton } from "@island/components/ui/skeleton";
import { IssuesEmpty } from "@/components/issues/issues-empty";
import { cn } from "@/lib/utils";
import { useSession } from "@island/app/session";
import { toastApiError, toastOk } from "@island/app/toast";
import { generateKeyBetween } from "@/db/positions";
import { createProject, patchProject } from "./api";
import { ProgressBar } from "./progress-bar";
import { useProjectsList } from "./use-projects";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectDto,
  type ProjectStatus,
} from "./types";
import { NewProjectDialog } from "./new-project-dialog";

function formatTarget(project: ProjectDto): string | null {
  if (!project.targetStartDate && !project.targetEndDate) return null;
  return `${project.targetStartDate ?? "…"} → ${project.targetEndDate ?? "…"}`;
}

function ProjectRow({
  project,
  onStatus,
  onDragStart,
  onDropBefore,
}: {
  project: ProjectDto;
  onStatus: (status: ProjectStatus) => void;
  onDragStart: () => void;
  onDropBefore: () => void;
}) {
  const target = formatTarget(project);
  const [over, setOver] = useState(false);
  return (
    <li
      className={cn("border-b last:border-b-0", over && "border-t-2 border-t-ring")}
      draggable
      aria-label={`Reorder ${project.name}`}
      data-project-id={project.id}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", project.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropBefore();
      }}
    >
      <div className="grid items-center gap-3 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_220px_140px_150px]">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full border border-border"
            style={project.color ? { backgroundColor: project.color } : undefined}
            aria-hidden="true"
          />
          <Link
            to={`/project/${project.id}`}
            className="min-w-0 truncate text-sm font-medium hover:underline"
          >
            {project.name}
          </Link>
          {project.archivedAt !== null ? (
            <span className="shrink-0 rounded-sm border px-1 text-[10px] uppercase text-muted-foreground">
              Archived
            </span>
          ) : null}
        </div>
        <ProgressBar
          size="sm"
          label={`${project.name} progress`}
          percent={project.progressCache}
          points={project.progressPoints}
        />
        <p className="font-mono text-xs text-muted-foreground">{target ?? "No target"}</p>
        <label className="flex items-center gap-1 text-xs">
          <span className="sr-only">Status of {project.name}</span>
          <select
            aria-label={`Status of ${project.name}`}
            className="h-7 w-full rounded-md border bg-transparent px-1 text-xs"
            value={project.status}
            onChange={(e) => onStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </li>
  );
}

export function ProjectsListScreen() {
  const session = useSession();
  const navigate = useNavigate();
  const wsId = session.activeWorkspace?.id ?? null;
  const { projects, status, reload } = useProjectsList(wsId);
  const [createOpen, setCreateOpen] = useState(false);
  // A ref, not state: the id is read once on drop and re-rendering the whole
  // list mid-drag would cancel the gesture.
  const dragged = useRef<string | null>(null);

  const groups = useMemo(() => {
    return PROJECT_STATUSES.map((s) => ({
      status: s,
      label: PROJECT_STATUS_LABELS[s],
      rows: projects.filter((p) => p.status === s),
    })).filter((g) => g.rows.length > 0);
  }, [projects]);

  const onStatus = (project: ProjectDto, next: ProjectStatus) => {
    if (!wsId) return;
    void patchProject(wsId, project.id, { status: next })
      .then(() => {
        reload();
        toastOk(`${project.name} moved to ${PROJECT_STATUS_LABELS[next]}`);
      })
      .catch(toastApiError);
  };

  /**
   * Reorder within a status group.
   *
   * The dragged project takes a key between the row it was dropped on and that
   * row's predecessor, so it lands immediately above the drop target and no
   * other row is touched. A drop onto a different status group is ignored:
   * position and status are separate facts, and the select beside each row is
   * how status changes.
   */
  const onReorder = (draggedId: string, target: ProjectDto) => {
    if (!wsId || draggedId === target.id) return;
    const dragged = projects.find((p) => p.id === draggedId);
    if (!dragged || dragged.status !== target.status) return;

    const group = projects.filter((p) => p.status === target.status);
    const targetIndex = group.findIndex((p) => p.id === target.id);
    const previous = group[targetIndex - 1];
    // Dropping a row onto the one already below it is a no-op, not a move.
    if (previous?.id === draggedId) return;
    const position = generateKeyBetween(previous?.position ?? null, target.position);

    void patchProject(wsId, draggedId, { position })
      .then(() => {
        reload();
        toastOk(`${dragged.name} moved`);
      })
      .catch(toastApiError);
  };

  const onCreate = async (input: { name: string; status: ProjectStatus }) => {
    if (!wsId) return;
    try {
      const res = await createProject(wsId, input);
      setCreateOpen(false);
      toastOk("Project created", res.project.name);
      navigate(`/project/${res.project.id}`);
    } catch (err) {
      toastApiError(err);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-screen="Projects">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
        <span className="font-mono text-xs text-muted-foreground">{projects.length}</span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New project
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "loading" ? (
          <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="Loading projects">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : status === "error" ? (
          <IssuesEmpty
            title="Something broke on our bench. It's been logged."
            explainer="The project list did not load."
            actionLabel="Retry"
            onAction={reload}
          />
        ) : projects.length === 0 ? (
          <IssuesEmpty
            title="No projects yet."
            explainer="A project groups issues across teams and tracks progress against a target."
            actionLabel="New project"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          groups.map((group) => (
            <section key={group.status} aria-label={group.label} className="border-b last:border-b-0">
              <h2 className="sticky top-0 z-10 bg-background px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                {group.label}
                <span className="ml-2 font-mono">{group.rows.length}</span>
              </h2>
              <ul>
                {group.rows.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onStatus={(next) => onStatus(project, next)}
                    onDragStart={() => {
                      dragged.current = project.id;
                    }}
                    onDropBefore={() => {
                      const from = dragged.current;
                      dragged.current = null;
                      if (from) onReorder(from, project);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <NewProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={onCreate} />
    </div>
  );
}
