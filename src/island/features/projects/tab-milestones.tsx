/**
 * PJ-04 milestones tab. Completion percent is derived server-side on every
 * read (§2.4), so this tab renders `milestone.progress` and never counts
 * issues itself.
 *
 * PJ-04's `Shift+M` and drag-onto-a-milestone belong to the issue view engine,
 * which is outside this ticket's owns list. The per-row filter link below
 * reaches the same issues through the Issues tab (T-030).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { toastApiError, toastOk } from "@island/app/toast";
import { ProgressBar } from "./progress-bar";
import type { MilestoneDto } from "./types";

function percentOf(milestone: MilestoneDto): number {
  const { total, completed } = milestone.progress;
  if (total === 0) return 0;
  return Math.round((100 * completed) / total);
}

function MilestoneRow({
  milestone,
  projectId,
  onRename,
  onTrash,
}: {
  milestone: MilestoneDto;
  projectId: string;
  onRename: (name: string) => Promise<void>;
  onTrash: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(milestone.name);
  const filter = encodeURIComponent(
    JSON.stringify({
      combinator: "and",
      children: [{ field: "milestone", op: "eq", value: milestone.id }],
    }),
  );

  const commit = async () => {
    const trimmed = name.trim();
    setEditing(false);
    if (trimmed.length === 0 || trimmed === milestone.name) {
      setName(milestone.name);
      return;
    }
    try {
      await onRename(trimmed);
      toastOk("Milestone renamed");
    } catch (err) {
      setName(milestone.name);
      toastApiError(err);
    }
  };

  return (
    <li className="grid items-center gap-3 border-b px-4 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_200px_120px_90px]">
      <div className="flex min-w-0 items-center gap-2">
        {editing ? (
          <Input
            aria-label={`Rename ${milestone.name}`}
            value={name}
            autoFocus
            className="h-7"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") {
                setName(milestone.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 truncate text-left text-sm font-medium hover:underline"
            onClick={() => setEditing(true)}
            aria-label={`Rename ${milestone.name}`}
          >
            {milestone.name}
          </button>
        )}
      </div>
      <ProgressBar
        size="sm"
        label={`${milestone.name} progress`}
        percent={percentOf(milestone)}
        points={{
          done: milestone.progress.pointsDone,
          total: milestone.progress.pointsTotal,
          issuesDone: milestone.progress.completed,
          issuesTotal: milestone.progress.total,
        }}
      />
      <p className="font-mono text-xs text-muted-foreground">{milestone.targetDate ?? "No date"}</p>
      <div className="flex items-center gap-1">
        <Link
          to={`/project/${projectId}/list?f=${filter}`}
          className="text-xs underline-offset-4 hover:underline"
        >
          Issues
        </Link>
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Delete ${milestone.name}`}
          onClick={() => {
            void onTrash()
              .then(() => toastOk("Milestone deleted"))
              .catch(toastApiError);
          }}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

export function MilestonesTab({
  projectId,
  milestones,
  onCreate,
  onRename,
  onTrash,
}: {
  projectId: string;
  milestones: MilestoneDto[];
  onCreate: (name: string, targetDate: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const create = async () => {
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await onCreate(trimmed, targetDate === "" ? null : targetDate);
      setName("");
      setTargetDate("");
      toastOk("Milestone added");
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-tab="milestones">
      {milestones.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No milestones yet. A milestone groups issues inside the project and counts itself.
        </p>
      ) : (
        <ul>
          {milestones.map((m) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              projectId={projectId}
              onRename={(next) => onRename(m.id, next)}
              onTrash={() => onTrash(m.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 px-4 py-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="pj-ms-name" className="text-xs text-muted-foreground">
            New milestone
          </label>
          <Input
            id="pj-ms-name"
            className="h-8 w-56"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pj-ms-date" className="text-xs text-muted-foreground">
            Target date
          </label>
          <input
            id="pj-ms-date"
            type="date"
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <Button size="sm" disabled={trimmed.length === 0 || busy} onClick={() => void create()}>
          Add milestone
        </Button>
      </div>
    </div>
  );
}
