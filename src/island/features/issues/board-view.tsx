/**
 * S-08 board: columns by group-by (default status). Desktop drag PATCHes
 * the grouped property and toasts undo. Keyboard Shift+arrows move too.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { PriorityGlyph } from "@/components/issues/priority-glyph";
import { Skeleton } from "@island/components/ui/skeleton";
import { Button } from "@island/components/ui/button";
import type { IssueGroup } from "./grouping";
import type { IssueListItem, LookupMaps } from "./types";

let draggingId: string | null = null;

export function peekDraggingIssueId(): string | null {
  return draggingId;
}

export function BoardView({
  groups,
  lookup,
  loading,
  wipLimit,
  onDropIssue,
  onOpenIssue,
  onAddInColumn,
}: {
  groups: IssueGroup[];
  lookup: LookupMaps;
  loading: boolean;
  wipLimit?: number | null;
  onDropIssue: (issueId: string, groupId: string) => void;
  onOpenIssue: (identifier: string) => void;
  onAddInColumn: (groupId: string) => void;
}) {
  const [overId, setOverId] = useState<string | null>(null);

  if (loading && groups.every((g) => g.issues.length === 0)) {
    return (
      <div className="grid grid-cols-3 gap-3 p-3" aria-busy="true" aria-label="Loading board">
        {Array.from({ length: 3 }, (_, c) => (
          <div key={c} className="flex flex-col gap-2">
            <Skeleton className="h-6 w-28" />
            {Array.from({ length: 4 }, (_, r) => (
              <Skeleton key={r} className="h-20 w-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3" data-board role="list">
      {groups.map((group) => {
        const overWip = wipLimit != null && group.issues.length > wipLimit;
        return (
          <section
            key={group.id}
            data-column-id={group.id}
            aria-label={group.label}
            className={`flex w-64 shrink-0 flex-col rounded-md border bg-card ${overId === group.id ? "ring-2 ring-ring" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverId(group.id);
            }}
            onDragLeave={() => setOverId((id) => (id === group.id ? null : id))}
            onDrop={(e) => {
              e.preventDefault();
              const fromData = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text/issue-id");
              const id = fromData || draggingId;
              draggingId = null;
              setOverId(null);
              if (id) onDropIssue(id, group.id);
            }}
          >
            <header className="flex items-center gap-2 border-b px-2 py-2">
              <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{group.label}</h3>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {group.issues.length}
              </span>
              {overWip ? (
                <span
                  className="size-2 rounded-full bg-destructive"
                  title={`${group.issues.length} open · WIP limit ${wipLimit}`}
                  aria-label="WIP limit exceeded"
                />
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Add issue in ${group.label}`}
                onClick={() => onAddInColumn(group.id)}
              >
                <Plus className="size-3.5" />
              </Button>
            </header>
            <ul className="flex flex-1 flex-col gap-2 p-2">
              {group.issues.length === 0 ? (
                <li className="px-1 py-6 text-center text-xs text-muted-foreground">Drop issues here</li>
              ) : (
                group.issues.map((issue) => (
                  <BoardCard
                    key={issue.id}
                    issue={issue}
                    lookup={lookup}
                    onOpen={() => onOpenIssue(issue.identifier)}
                  />
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({
  issue,
  lookup,
  onOpen,
}: {
  issue: IssueListItem;
  lookup: LookupMaps;
  onOpen: () => void;
}) {
  const assignee = issue.assigneeId ? lookup.members[issue.assigneeId] : null;
  return (
    <li>
      <article
        draggable
        data-issue-id={issue.id}
        data-identifier={issue.identifier}
        onDragStart={(e) => {
          draggingId = issue.id;
          e.dataTransfer.setData("text/plain", issue.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          draggingId = null;
        }}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        tabIndex={0}
        className="cursor-pointer rounded-md border bg-background p-2 shadow-xs hover:-translate-y-px hover:shadow-sm"
        style={{ padding: "var(--card-py) var(--card-px)" }}
      >
        <p className="font-mono text-[11px] text-muted-foreground">{issue.identifier}</p>
        <p className="line-clamp-2 text-sm">{issue.title}</p>
        <footer className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <PriorityGlyph priority={issue.priority} />
          <span className="ml-auto truncate">{assignee?.name ?? ""}</span>
        </footer>
      </article>
    </li>
  );
}
