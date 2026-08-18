import { z } from "zod";

export const FILTER_FIELDS = [
  "team",
  "status",
  "statusCategory",
  "assignee",
  "creator",
  "priority",
  "label",
  "project",
  "milestone",
  "cycle",
  "dueDate",
  "estimate",
  "created",
  "updated",
  "identifier",
] as const;

export const FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "nin",
  "includesAny",
  "includesAll",
  "excludes",
  "before",
  "after",
  "withinLast",
] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];
export type FilterOp = (typeof FILTER_OPS)[number];

export type FilterLeaf = {
  field: FilterField;
  op: FilterOp;
  value: string | number | string[] | { days: number };
};

export type FilterGroup = {
  combinator: "and" | "or";
  children: FilterNode[];
  not?: boolean;
};

export type FilterNode = FilterLeaf | FilterGroup;

const filterLeafSchema: z.ZodType<FilterLeaf> = z.object({
  field: z.enum(FILTER_FIELDS),
  op: z.enum(FILTER_OPS),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.object({ days: z.number().int().positive() }),
  ]),
});

export const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    filterLeafSchema,
    z.object({
      combinator: z.enum(["and", "or"]),
      children: z.array(filterNodeSchema),
      not: z.boolean().optional(),
    }),
  ]),
);

export const createViewSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: z.enum(["workspace", "team", "project"]).default("workspace"),
  teamId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  layout: z.enum(["list", "board", "table"]).default("list"),
  filters: filterNodeSchema.optional(),
  groupBy: z.string().max(40).nullable().optional(),
  subGroupBy: z.string().max(40).nullable().optional(),
  orderBy: z.enum(["created", "updated", "status", "priority", "due", "manual"]).default("created"),
  orderDir: z.enum(["asc", "desc"]).default("desc"),
  display: z.record(z.string(), z.unknown()).optional(),
});

export const patchViewSchema = createViewSchema.partial();
