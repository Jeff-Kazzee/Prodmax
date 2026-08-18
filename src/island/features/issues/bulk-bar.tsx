/** L-05 bulk action bar — one POST /api/issues/bulk, single undo token. */
import { Button } from "@island/components/ui/button";
import type { StateOption } from "./types";
import { PRIORITY_LABELS } from "./types";

export function BulkBar({
  count,
  states,
  onAction,
  onClear,
}: {
  count: number;
  states: StateOption[];
  onAction: (action: string, value?: unknown) => void;
  onClear: () => void;
}) {
  if (count < 1) return null;
  const uniqueStates = dedupeStates(states);
  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-1/2 z-[var(--z-sticky)] flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-md"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="font-mono text-xs tabular-nums">{count} selected</span>
      <label className="text-xs">
        <span className="sr-only">Bulk status</span>
        <select
          aria-label="Set status"
          className="h-7 rounded-md border bg-background px-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onAction("state", e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">Status</option>
          {uniqueStates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="sr-only">Bulk priority</span>
        <select
          aria-label="Set priority"
          className="h-7 rounded-md border bg-background px-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value !== "") onAction("priority", Number(e.target.value));
            e.target.value = "";
          }}
        >
          <option value="">Priority</option>
          {PRIORITY_LABELS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" size="xs" onClick={() => onAction("archive", true)}>
        Archive
      </Button>
      <Button variant="destructive" size="xs" onClick={() => onAction("delete", true)}>
        Delete
      </Button>
      <Button variant="ghost" size="xs" aria-label="Clear selection" onClick={onClear}>
        ✕
      </Button>
    </div>
  );
}

function dedupeStates(states: StateOption[]): StateOption[] {
  const seen = new Set<string>();
  const out: StateOption[] = [];
  for (const s of states) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}
