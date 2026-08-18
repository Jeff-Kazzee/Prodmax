import { and, asc, desc, not, or, sql, type SQL } from "drizzle-orm";
import { issues } from "@/db/schema";
import { HttpError } from "@/lib/api/errors";
import type { FilterGroup, FilterLeaf, FilterNode } from "@/lib/validation/views";
import { filterNodeSchema } from "@/lib/validation/views";

function isGroup(node: FilterNode): node is FilterGroup {
  return "combinator" in node;
}

export function parseFiltersParam(raw: string | null): FilterNode | undefined {
  if (raw === null || raw === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError("VALIDATION", "filters must be JSON", ["filters: invalid JSON"]);
  }
  const result = filterNodeSchema.safeParse(parsed);
  if (!result.success) {
    throw new HttpError(
      "VALIDATION",
      "Invalid filter AST",
      result.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
    );
  }
  assertFilterDepth(result.data);
  return result.data;
}

export function assertFilterDepth(node: FilterNode, depth = 1): void {
  if (!isGroup(node)) return;
  if (depth > 3) throw new HttpError("VALIDATION", "Filter group depth exceeds 3");
  for (const child of node.children) {
    if (isGroup(child)) assertFilterDepth(child, depth + 1);
  }
}

function asStringList(value: FilterLeaf["value"]): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  throw new HttpError("VALIDATION", "Filter value must be a string or string[]");
}

function asScalar(value: FilterLeaf["value"]): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  throw new HttpError("VALIDATION", "Filter value must be a scalar");
}

function asDays(value: FilterLeaf["value"]): number {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "days" in value) return value.days;
  throw new HttpError("VALIDATION", "withinLast requires {days:number}");
}

function inParams(ids: string[]): SQL {
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}

function labelClause(op: FilterLeaf["op"], ids: string[]): SQL {
  if (ids.length === 0) return sql`1 = 0`;
  const any = sql`EXISTS (SELECT 1 FROM issue_labels WHERE issue_labels.issue_id = ${issues.id} AND issue_labels.label_id IN ${inParams(ids)})`;
  const all = and(
    ...ids.map(
      (id) =>
        sql`EXISTS (SELECT 1 FROM issue_labels WHERE issue_labels.issue_id = ${issues.id} AND issue_labels.label_id = ${id})`,
    ),
  )!;
  if (op === "eq" || op === "includesAny" || op === "in") return any;
  if (op === "includesAll") return all;
  if (op === "excludes" || op === "nin" || op === "neq") return sql`NOT (${any})`;
  throw new HttpError("VALIDATION", `Unsupported op ${op} for label`);
}

function compileLeaf(leaf: FilterLeaf): SQL {
  if (leaf.field === "label") return labelClause(leaf.op, asStringList(leaf.value));
  if (leaf.field === "statusCategory") {
    const values = asStringList(leaf.value);
    const exists = sql`EXISTS (SELECT 1 FROM states WHERE states.id = ${issues.stateId} AND states.category IN ${inParams(values)})`;
    if (leaf.op === "eq" || leaf.op === "in") return exists;
    if (leaf.op === "neq" || leaf.op === "nin") return sql`NOT (${exists})`;
    throw new HttpError("VALIDATION", `Unsupported op ${leaf.op} for statusCategory`);
  }
  const col =
    leaf.field === "team"
      ? issues.teamId
      : leaf.field === "status"
        ? issues.stateId
        : leaf.field === "assignee"
          ? issues.assigneeId
          : leaf.field === "creator"
            ? issues.creatorId
            : leaf.field === "priority"
              ? issues.priority
              : leaf.field === "project"
                ? issues.projectId
                : leaf.field === "milestone"
                  ? issues.milestoneId
                  : leaf.field === "cycle"
                    ? issues.cycleId
                    : leaf.field === "dueDate"
                      ? issues.dueDate
                      : leaf.field === "estimate"
                        ? issues.estimate
                        : leaf.field === "created"
                          ? issues.createdAt
                          : leaf.field === "updated"
                            ? issues.updatedAt
                            : issues.identifier;
  switch (leaf.op) {
    case "eq":
      return sql`${col} = ${asScalar(leaf.value)}`;
    case "neq":
      return sql`${col} != ${asScalar(leaf.value)}`;
    case "in": {
      const list = asStringList(leaf.value);
      return list.length === 0 ? sql`1 = 0` : sql`${col} IN ${inParams(list)}`;
    }
    case "nin": {
      const list = asStringList(leaf.value);
      return list.length === 0 ? sql`1 = 1` : sql`${col} NOT IN ${inParams(list)}`;
    }
    case "before":
      return sql`${col} < ${asScalar(leaf.value)}`;
    case "after":
      return sql`${col} > ${asScalar(leaf.value)}`;
    case "withinLast":
      return sql`${col} >= ${Date.now() - asDays(leaf.value) * 86_400_000}`;
    case "includesAny":
    case "includesAll":
    case "excludes":
      throw new HttpError("VALIDATION", `Op ${leaf.op} is only valid for label`);
    default: {
      const _never: never = leaf.op;
      throw new HttpError("VALIDATION", `Unknown op: ${String(_never)}`);
    }
  }
}

export function compileFilter(node: FilterNode): SQL {
  if (!isGroup(node)) return compileLeaf(node);
  if (node.children.length === 0) return sql`1 = 1`;
  const children = node.children.map(compileFilter);
  const combined = node.combinator === "and" ? and(...children) : or(...children);
  const sqlNode = combined ?? sql`1 = 1`;
  return node.not ? not(sqlNode) : sqlNode;
}

export function issueOrder(raw: string | null): SQL[] {
  const [field, dirRaw] = (raw ?? "updated:desc").split(":");
  const dir = dirRaw === "asc" ? "asc" : "desc";
  const column =
    field === "created"
      ? issues.createdAt
      : field === "status"
        ? issues.stateId
        : field === "priority"
          ? issues.priority
          : field === "due"
            ? issues.dueDate
            : field === "manual"
              ? issues.position
              : issues.updatedAt;
  return dir === "asc" ? [asc(column), asc(issues.identifier)] : [desc(column), desc(issues.identifier)];
}
