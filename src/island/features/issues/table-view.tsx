/**
 * S-09 table: frozen ID column, APG grid, header sort, column visibility,
 * Enter/Tab commit · Esc revert on the title cell.
 */
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Input } from "@island/components/ui/input";
import { Skeleton } from "@island/components/ui/skeleton";
import { StateDot } from "@/components/issues/state-dot";
import { cn } from "@/lib/utils";
import type { IssueListItem, LookupMaps, OrderBy, OrderDir } from "./types";
import { PRIORITY_LABELS } from "./types";

const ALL_COLUMNS = ["title", "status", "assignee", "priority", "labels", "due"] as const;
type Column = (typeof ALL_COLUMNS)[number];

export function TableView({
  issues,
  lookup,
  loading,
  selectedIds,
  orderBy,
  orderDir,
  onToggleSelect,
  onPatch,
  onSort,
}: {
  issues: IssueListItem[];
  lookup: LookupMaps;
  loading: boolean;
  selectedIds: Set<string>;
  orderBy: OrderBy;
  orderDir: OrderDir;
  onToggleSelect: (id: string, shift: boolean) => void;
  onPatch: (id: string, body: Record<string, unknown>, previous: Record<string, unknown>) => void;
  onSort: (field: OrderBy) => void;
}) {
  const [hidden, setHidden] = useState<Set<Column>>(new Set());
  const visible = useMemo(() => ALL_COLUMNS.filter((c) => !hidden.has(c)), [hidden]);

  if (loading && issues.length === 0) {
    return (
      <div className="p-3" aria-busy="true">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="mb-1 w-full" style={{ height: "var(--row-h)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex gap-2 border-b px-3 py-1">
        {ALL_COLUMNS.map((col) => (
          <label key={col} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={!hidden.has(col)}
              onChange={() => {
                const next = new Set(hidden);
                if (next.has(col)) next.delete(col);
                else next.add(col);
                setHidden(next);
              }}
            />
            {col}
          </label>
        ))}
      </div>
      <table className="w-full border-separate border-spacing-0 text-sm" role="grid" aria-label="Issues table">
        <thead>
          <tr role="row">
            <th className="sticky left-0 z-[1] w-14 border-b bg-background px-2 text-left font-mono text-xs" role="columnheader">
              ID
            </th>
            {visible.map((col) => (
              <th key={col} className="border-b px-2 text-left text-xs font-medium" role="columnheader">
                <button type="button" className="uppercase tracking-wide" onClick={() => onSort(sortField(col))}>
                  {col}
                  {orderBy === sortField(col) ? (orderDir === "asc" ? " ▲" : " ▼") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <TableRow
              key={issue.id}
              issue={issue}
              lookup={lookup}
              visible={visible}
              selected={selectedIds.has(issue.id)}
              onToggleSelect={onToggleSelect}
              onPatch={onPatch}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sortField(col: Column): OrderBy {
  if (col === "status") return "status";
  if (col === "priority") return "priority";
  if (col === "due") return "due";
  return "updated";
}

function TableRow({
  issue,
  lookup,
  visible,
  selected,
  onToggleSelect,
  onPatch,
}: {
  issue: IssueListItem;
  lookup: LookupMaps;
  visible: Column[];
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onPatch: (id: string, body: Record<string, unknown>, previous: Record<string, unknown>) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState(issue.title);
  const [editing, setEditing] = useState(false);
  const state = lookup.states[issue.stateId];

  const open = () => {
    const params = new URLSearchParams(location.search);
    params.set("issue", issue.identifier);
    navigate(`${location.pathname}?${params.toString()}`);
  };

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== issue.title) {
      onPatch(issue.id, { title: draft.trim() }, { title: issue.title });
    } else {
      setDraft(issue.title);
    }
  };

  return (
    <tr role="row" aria-selected={selected} className={cn(selected && "bg-accent")} style={{ height: "var(--row-h)" }}>
      <th
        className="sticky left-0 z-[1] border-b bg-background px-2 text-left font-mono text-xs"
        role="rowheader"
        onClick={() => {
          void navigator.clipboard?.writeText(issue.identifier);
        }}
      >
        <input
          type="checkbox"
          className="mr-1"
          checked={selected}
          aria-label={`Select ${issue.identifier}`}
          onChange={(e) => onToggleSelect(issue.id, (e.nativeEvent as MouseEvent).shiftKey)}
        />
        {issue.identifier}
      </th>
      {visible.map((col) => (
        <td key={col} className="border-b px-2" role="gridcell">
          {col === "title" ? (
            editing ? (
              <Input
                aria-label="Title"
                className="h-7"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") {
                    setDraft(issue.title);
                    setEditing(false);
                  }
                  if (e.key === "Tab") commit();
                }}
                onBlur={commit}
                autoFocus
              />
            ) : (
              <button type="button" className="truncate text-left hover:underline" onClick={open} onDoubleClick={() => setEditing(true)}>
                {issue.title}
              </button>
            )
          ) : null}
          {col === "status" && state ? <StateDot name={state.name} color={state.color} /> : null}
          {col === "assignee" ? (issue.assigneeId ? lookup.members[issue.assigneeId]?.name ?? "—" : "—") : null}
          {col === "priority" ? PRIORITY_LABELS[issue.priority] : null}
          {col === "labels" ? issue.labelIds.map((id) => lookup.labels[id]?.name ?? id).join(", ") : null}
          {col === "due" ? issue.dueDate ?? "—" : null}
        </td>
      ))}
    </tr>
  );
}
