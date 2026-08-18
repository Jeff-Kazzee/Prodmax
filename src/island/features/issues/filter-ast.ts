/**
 * Filter AST helpers for S-10: chip CRUD, `?f=` round-trip, depth cap 3.
 * Encoding is compact JSON; URLSearchParams handles percent-encoding.
 */
import type { FilterField, FilterGroup, FilterLeaf, FilterNode, FilterOp } from "@/lib/validation/views";
import { FILTER_FIELDS } from "@/lib/validation/views";

export const EMPTY_FILTER: FilterGroup = { combinator: "and", children: [] };

export function isGroup(node: FilterNode): node is FilterGroup {
  return "combinator" in node;
}

export function isEmptyFilter(node: FilterNode): boolean {
  return isGroup(node) && node.children.length === 0 && !node.not;
}

export function encodeF(node: FilterNode): string {
  return JSON.stringify(node);
}

export function decodeF(raw: string | null | undefined): FilterNode {
  if (!raw) return EMPTY_FILTER;
  try {
    const text = raw.startsWith("%") ? decodeURIComponent(raw) : raw;
    const parsed: unknown = JSON.parse(text);
    return asFilterNode(parsed) ?? EMPTY_FILTER;
  } catch {
    return EMPTY_FILTER;
  }
}

function asFilterNode(value: unknown): FilterNode | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if ("combinator" in rec) {
    const combinator = rec.combinator === "or" ? "or" : "and";
    const children = Array.isArray(rec.children)
      ? rec.children.map(asFilterNode).filter((n): n is FilterNode => n !== null)
      : [];
    const group: FilterGroup = { combinator, children };
    if (rec.not === true) group.not = true;
    return group;
  }
  if (typeof rec.field === "string" && typeof rec.op === "string") {
    return rec as unknown as FilterLeaf;
  }
  return null;
}

/** Flatten an AND group of leaves into chips; nested groups stay grouped. */
export function chipNodes(node: FilterNode): FilterNode[] {
  if (!isGroup(node)) return [node];
  return node.children;
}

export function addChip(root: FilterNode, leaf: FilterLeaf): FilterGroup {
  const group: FilterGroup = isGroup(root)
    ? { ...root, children: [...root.children, leaf] }
    : { combinator: "and", children: [root, leaf] };
  return group;
}

export function removeChip(root: FilterNode, index: number): FilterGroup {
  if (!isGroup(root)) return index === 0 ? EMPTY_FILTER : { combinator: "and", children: [root] };
  return { ...root, children: root.children.filter((_, i) => i !== index) };
}

export function updateChip(root: FilterNode, index: number, next: FilterNode): FilterGroup {
  if (!isGroup(root)) return { combinator: "and", children: [next] };
  return { ...root, children: root.children.map((c, i) => (i === index ? next : c)) };
}

export function filterDepth(node: FilterNode, depth = 1): number {
  if (!isGroup(node)) return depth;
  let max = depth;
  for (const child of node.children) {
    if (isGroup(child)) max = Math.max(max, filterDepth(child, depth + 1));
  }
  return max;
}

/** Replace assignee/creator `"me"` with the signed-in user id for the API. */
export function resolveFilter(node: FilterNode, userId: string): FilterNode {
  if (!isGroup(node)) {
    if ((node.field === "assignee" || node.field === "creator") && node.value === "me") {
      return { ...node, value: userId };
    }
    return node;
  }
  return { ...node, children: node.children.map((c) => resolveFilter(c, userId)) };
}

export const FIELD_LABELS: Record<FilterField, string> = {
  team: "Team",
  status: "Status",
  statusCategory: "Status category",
  assignee: "Assignee",
  creator: "Creator",
  priority: "Priority",
  label: "Label",
  project: "Project",
  milestone: "Milestone",
  cycle: "Cycle",
  dueDate: "Due",
  estimate: "Estimate",
  created: "Created",
  updated: "Updated",
  identifier: "ID",
};

export const OP_LABELS: Record<FilterOp, string> = {
  eq: "is",
  neq: "is not",
  in: "is either of",
  nin: "is not any of",
  includesAny: "includes any",
  includesAll: "includes all",
  excludes: "excludes",
  before: "before",
  after: "after",
  withinLast: "within last",
};

export function defaultOp(field: FilterField): FilterOp {
  if (field === "label") return "includesAny";
  if (field === "dueDate" || field === "created" || field === "updated") return "after";
  return "eq";
}

export function formatChipValue(leaf: FilterLeaf): string {
  const { value } = leaf;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null && "days" in value) return `${value.days}d`;
  if (leaf.field === "priority" && (typeof value === "string" || typeof value === "number")) {
    const n = Number(value);
    const labels = ["None", "Low", "Medium", "High", "Urgent"];
    return labels[n] ?? String(value);
  }
  if (value === "me") return "Me";
  return String(value);
}

export const CHIP_FIELDS: readonly FilterField[] = FILTER_FIELDS;
