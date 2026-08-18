import { z } from "zod";

export const prioritySchema = z.number().int().min(0).max(4);
export const relationTypeSchema = z.enum(["related", "blocked_by", "blocking", "duplicate"]);

export const createIssueSchema = z.object({
  teamId: z.string().min(1),
  title: z.string().trim().min(1).max(512),
  descriptionMd: z.string().max(100_000).optional(),
  stateId: z.string().min(1).optional(),
  priority: prioritySchema.optional(),
  estimate: z.number().int().min(0).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  milestoneId: z.string().min(1).nullable().optional(),
  cycleId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  labelIds: z.array(z.string().min(1)).max(50).optional(),
});

export const patchIssueSchema = z.object({
  title: z.string().trim().min(1).max(512).optional(),
  descriptionMd: z.string().max(100_000).optional(),
  stateId: z.string().min(1).optional(),
  priority: prioritySchema.optional(),
  estimate: z.number().int().min(0).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  milestoneId: z.string().min(1).nullable().optional(),
  cycleId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  labelIds: z.array(z.string().min(1)).max(50).optional(),
  archived: z.boolean().optional(),
});

export const bulkIssueSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum([
    "state",
    "assignee",
    "labels",
    "priority",
    "archive",
    "delete",
    "move_team",
    "cycle",
    "project",
  ]),
  value: z.unknown().optional(),
});

export const relationBodySchema = z.object({
  relatedIssueId: z.string().min(1),
  type: relationTypeSchema,
});

export const subscriberBodySchema = z.object({
  userId: z.string().min(1).optional(),
  reason: z.literal("manual").optional(),
});

export const moveTeamSchema = z.object({
  teamId: z.string().min(1),
});

export const commentBodySchema = z.object({
  bodyMd: z.string().trim().min(1).max(20_000),
  parentId: z.string().min(1).nullable().optional(),
});

export const patchCommentSchema = z.object({
  bodyMd: z.string().trim().min(1).max(20_000).optional(),
  resolvedAt: z.number().int().nullable().optional(),
});
