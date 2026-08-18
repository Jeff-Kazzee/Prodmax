/**
 * L-02 IssueRow. Click navigates `?issue=` (panel is T-004). Inline
 * property cells PATCH optimistically via onPatch.
 */
import { Link, useLocation } from "react-router-dom";
import { PriorityGlyph } from "@/components/issues/priority-glyph";
import { StateDot } from "@/components/issues/state-dot";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, type IssueListItem, type LookupMaps, type StateOption } from "./types";

export function IssueRow({
  issue,
  lookup,
  selected,
  focused,
  showHandle,
  onToggleSelect,
  onPatch,
  onFocus,
}: {
  issue: IssueListItem;
  lookup: LookupMaps;
  selected: boolean;
  focused?: boolean;
  showHandle?: boolean;
  onToggleSelect: (shift: boolean) => void;
  onPatch: (id: string, body: Record<string, unknown>, previous: Record<string, unknown>) => void;
  onFocus?: () => void;
}) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("issue", issue.identifier);
  const href = `${location.pathname}?${params.toString()}`;
  const state = lookup.states[issue.stateId];
  const assignee = issue.assigneeId ? lookup.members[issue.assigneeId] : null;
  const teamStates = Object.values(lookup.states).filter((s) => s.teamId === issue.teamId);

  return (
    <div
      role="row"
      data-issue-id={issue.id}
      data-identifier={issue.identifier}
      aria-selected={selected}
      onClick={onFocus}
      className={cn(
        "group grid items-center gap-2 border-b px-2 text-sm hover:bg-accent/60",
        selected && "bg-accent",
        focused && "ring-1 ring-ring",
      )}
      style={{
        height: "var(--row-h)",
        gridTemplateColumns: "20px 24px 72px minmax(0,1fr) 132px 96px 72px",
      }}
    >
      <label className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <span className="sr-only">Select {issue.identifier}</span>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect((e.nativeEvent as MouseEvent).shiftKey)}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
      {showHandle ? (
        <span className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden="true">
          ⋮⋮
        </span>
      ) : (
        <PriorityGlyph priority={issue.priority} />
      )}
      <Link
        to={href}
        className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {issue.identifier}
      </Link>
      <Link to={href} className="min-w-0 truncate hover:underline" onClick={(e) => e.stopPropagation()}>
        {issue.title}
        {issue.parentId ? (
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">sub</span>
        ) : null}
      </Link>
      <StateSelect
        states={teamStates}
        current={state}
        onChange={(stateId) => onPatch(issue.id, { stateId }, { stateId: issue.stateId })}
      />
      <span className="truncate text-xs text-muted-foreground">{assignee?.name ?? "—"}</span>
      <PrioritySelect
        priority={issue.priority}
        onChange={(priority) => onPatch(issue.id, { priority }, { priority: issue.priority })}
      />
    </div>
  );
}

function StateSelect({
  states,
  current,
  onChange,
}: {
  states: StateOption[];
  current: StateOption | undefined;
  onChange: (stateId: string) => void;
}) {
  return (
    <label className="min-w-0" onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Status</span>
      <span className="flex items-center gap-1">
        {current ? <StateDot name={current.name} color={current.color} className="min-w-0" /> : <span>—</span>}
      </span>
      <select
        aria-label="Status"
        className="sr-only"
        value={current?.id ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {states.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PrioritySelect({
  priority,
  onChange,
}: {
  priority: number;
  onChange: (priority: number) => void;
}) {
  return (
    <label onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">Priority</span>
      <select
        aria-label="Priority"
        className="h-7 w-full rounded-md border bg-transparent px-1 text-xs"
        value={priority}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {PRIORITY_LABELS.map((label, i) => (
          <option key={label} value={i}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
