/**
 * S-10 filter bar: chips + add/remove + `?f=` round-trip. Advanced and/or
 * is a combinator toggle on the root group (depth ≤3).
 */
import { useMemo, useState } from "react";
import type { FilterField, FilterLeaf, FilterNode, FilterOp } from "@/lib/validation/views";
import { Button } from "@island/components/ui/button";
import { Input } from "@island/components/ui/input";
import { Kbd } from "@island/components/ui/kbd";
import {
  CHIP_FIELDS,
  FIELD_LABELS,
  OP_LABELS,
  addChip,
  chipNodes,
  defaultOp,
  formatChipValue,
  isGroup,
  isEmptyFilter,
  removeChip,
  updateChip,
} from "./filter-ast";

const OPS: FilterOp[] = ["eq", "neq", "in", "nin", "includesAny", "includesAll", "excludes", "before", "after", "withinLast"];

export function FilterBar({
  filter,
  count,
  onChange,
  onFocusFirstRow,
}: {
  filter: FilterNode;
  count: number | null;
  onChange: (next: FilterNode) => void;
  onFocusFirstRow?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [field, setField] = useState<FilterField>("priority");
  const [op, setOp] = useState<FilterOp>("eq");
  const [value, setValue] = useState("3");
  const [editing, setEditing] = useState<number | null>(null);

  const chips = useMemo(() => chipNodes(filter), [filter]);
  const combinator = isGroup(filter) ? filter.combinator : "and";

  const commitAdd = () => {
    const leaf = parseLeaf(field, op, value);
    onChange(addChip(filter, leaf));
    setAdding(false);
    setValue("");
  };

  return (
    <div
      className="sticky top-0 z-[var(--z-sticky)] flex h-10 items-center gap-2 border-b bg-background px-3"
      data-filter-bar
      role="search"
      aria-label="Issue filters"
    >
      {isGroup(filter) && chips.length > 1 ? (
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Combinator ${combinator}. Activate to flip`}
          onClick={() => onChange({ ...filter, combinator: combinator === "and" ? "or" : "and" })}
          className="font-mono text-[11px]"
        >
          {combinator}
        </Button>
      ) : null}

      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {chips.map((chip, index) => (
          <li key={index}>
            <FilterChip
              node={chip}
              editing={editing === index}
              onEdit={() => setEditing(index)}
              onCancel={() => setEditing(null)}
              onSave={(next) => {
                onChange(updateChip(filter, index, next));
                setEditing(null);
              }}
              onRemove={() => onChange(removeChip(filter, index))}
            />
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex items-center gap-1">
          <select
            aria-label="Filter property"
            className="h-7 rounded-md border bg-background px-1 text-xs"
            value={field}
            onChange={(e) => {
              const next = e.target.value as FilterField;
              setField(next);
              setOp(defaultOp(next));
            }}
          >
            {CHIP_FIELDS.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter operator"
            className="h-7 rounded-md border bg-background px-1 font-mono text-xs"
            value={op}
            onChange={(e) => setOp(e.target.value as FilterOp)}
          >
            {OPS.map((o) => (
              <option key={o} value={o}>
                {OP_LABELS[o]}
              </option>
            ))}
          </select>
          <Input
            aria-label="Filter value"
            className="h-7 w-28 text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") setAdding(false);
            }}
            autoFocus
          />
          <Button size="xs" onClick={commitAdd}>
            Add
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="xs"
          data-filter-add
          aria-label="Add filter"
          onClick={() => setAdding(true)}
        >
          + Filter <Kbd className="ml-1">F</Kbd>
        </Button>
      )}

      <button
        type="button"
        className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
        onClick={onFocusFirstRow}
        aria-label={`${count ?? "…"} issues`}
      >
        {count === null ? "…" : `${count} issues`}
      </button>
      {!isEmptyFilter(filter) ? (
        <Button variant="ghost" size="xs" aria-label="Clear filters" onClick={() => onChange({ combinator: "and", children: [] })}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function FilterChip({
  node,
  editing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: {
  node: FilterNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (next: FilterNode) => void;
  onRemove: () => void;
}) {
  if (isGroup(node)) {
    return (
      <span className="inline-flex h-7 items-center rounded-md border px-2 font-mono text-[11px] text-muted-foreground">
        {node.not ? "not " : ""}
        {node.combinator} ({node.children.length})
        <button type="button" className="ml-1 text-muted-foreground" aria-label="Remove group" onClick={onRemove}>
          ×
        </button>
      </span>
    );
  }
  const leaf = node;
  if (editing) {
    return (
      <ChipEditor leaf={leaf} onCancel={onCancel} onSave={onSave} />
    );
  }
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-xs">
      <button type="button" onClick={onEdit} className="inline-flex items-center gap-1">
        <span className="text-muted-foreground">{FIELD_LABELS[leaf.field]}</span>
        <span className="font-mono text-[11px]">{OP_LABELS[leaf.op]}</span>
        <span>{formatChipValue(leaf)}</span>
      </button>
      <button type="button" aria-label={`Remove ${FIELD_LABELS[leaf.field]} filter`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

function ChipEditor({
  leaf,
  onCancel,
  onSave,
}: {
  leaf: FilterLeaf;
  onCancel: () => void;
  onSave: (next: FilterNode) => void;
}) {
  const [op, setOp] = useState<FilterOp>(leaf.op);
  const [value, setValue] = useState(valueToInput(leaf));
  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label="Edit operator"
        className="h-7 rounded-md border bg-background px-1 font-mono text-xs"
        value={op}
        onChange={(e) => setOp(e.target.value as FilterOp)}
      >
        {OPS.map((o) => (
          <option key={o} value={o}>
            {OP_LABELS[o]}
          </option>
        ))}
      </select>
      <Input
        aria-label="Edit filter value"
        className="h-7 w-28 text-xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(parseLeaf(leaf.field, op, value));
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />
      <Button size="xs" onClick={() => onSave(parseLeaf(leaf.field, op, value))}>
        Save
      </Button>
    </span>
  );
}

function valueToInput(leaf: FilterLeaf): string {
  const { value } = leaf;
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object" && value !== null && "days" in value) return String(value.days);
  return String(value);
}

function parseLeaf(field: FilterField, op: FilterOp, raw: string): FilterLeaf {
  const trimmed = raw.trim();
  if (op === "withinLast") return { field, op, value: { days: Math.max(1, Number(trimmed) || 1) } };
  if (op === "in" || op === "nin" || op === "includesAny" || op === "includesAll" || op === "excludes") {
    return { field, op, value: trimmed.split(",").map((s) => s.trim()).filter(Boolean) };
  }
  if (field === "priority" || field === "estimate") {
    const n = Number(trimmed);
    return { field, op, value: Number.isFinite(n) ? n : trimmed };
  }
  return { field, op, value: trimmed };
}

export function focusFilterAdd(): void {
  const el = document.querySelector<HTMLElement>("[data-filter-add]");
  el?.focus();
  el?.click();
}
