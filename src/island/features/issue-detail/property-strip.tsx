/**
 * IP-03 property strip. Every chip is a real PATCH. Project/cycle/milestone
 * wait for T-005 lookups, so they are omitted rather than faked.
 */
import { PRIORITY_LABELS, type LookupMaps, type StateOption } from "@island/features/issues/types";
import type { IssueDetail } from "./types";

export const PROPERTY_KEYS: Record<string, string> = {
  s: "state",
  a: "assignee",
  i: "assignee",
  l: "labels",
  p: "priority",
};

export function PropertyStrip({
  issue,
  lookup,
  onPatch,
}: {
  issue: IssueDetail;
  lookup: LookupMaps;
  onPatch: (body: Record<string, unknown>, previous: Record<string, unknown>) => void;
}) {
  const teamStates = Object.values(lookup.states).filter((s) => s.teamId === issue.teamId);
  const members = Object.values(lookup.members);
  const labels = Object.values(lookup.labels);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2" data-property-strip>
      <label className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">State</span>
        <select
          data-prop="state"
          aria-label="State"
          className="h-7 rounded-md border bg-transparent px-1"
          value={issue.stateId}
          onChange={(e) => onPatch({ stateId: e.target.value }, { stateId: issue.stateId })}
        >
          {teamStates.map((s: StateOption) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Assignee</span>
        <select
          data-prop="assignee"
          aria-label="Assignee"
          className="h-7 rounded-md border bg-transparent px-1"
          value={issue.assigneeId ?? ""}
          onChange={(e) =>
            onPatch({ assigneeId: e.target.value || null }, { assigneeId: issue.assigneeId })
          }
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
        <span className="text-muted-foreground">Priority</span>
        <select
          data-prop="priority"
          aria-label="Priority"
          className="h-7 rounded-md border bg-transparent px-1"
          value={issue.priority}
          onChange={(e) => onPatch({ priority: Number(e.target.value) }, { priority: issue.priority })}
        >
          {PRIORITY_LABELS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Due</span>
        <input
          data-prop="due"
          aria-label="Due date"
          type="date"
          className="h-7 rounded-md border bg-transparent px-1"
          value={issue.dueDate ?? ""}
          onChange={(e) => onPatch({ dueDate: e.target.value || null }, { dueDate: issue.dueDate })}
        />
      </label>
      <label className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Estimate</span>
        <input
          data-prop="estimate"
          aria-label="Estimate"
          type="number"
          min={0}
          className="h-7 w-16 rounded-md border bg-transparent px-1"
          value={issue.estimate ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            onPatch({ estimate: n }, { estimate: issue.estimate });
          }}
        />
      </label>
      <fieldset className="flex flex-wrap items-center gap-1 text-xs">
        <legend className="sr-only">Labels</legend>
        {labels.map((label) => {
          const on = issue.labelIds.includes(label.id);
          return (
            <label key={label.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5">
              <input
                data-prop="labels"
                type="checkbox"
                checked={on}
                onChange={() => {
                  const next = on
                    ? issue.labelIds.filter((id) => id !== label.id)
                    : [...issue.labelIds, label.id];
                  onPatch({ labelIds: next }, { labelIds: issue.labelIds });
                }}
              />
              {label.name}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

export function focusProperty(name: string): void {
  const el = document.querySelector<HTMLElement>(`[data-prop="${name}"]`);
  el?.focus();
}
