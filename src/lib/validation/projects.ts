import { z } from "zod";
import { isValidKey } from "@/db/positions";

export const projectStatusSchema = z.enum(["backlog", "planned", "started", "completed", "canceled"]);
export const updateCadenceSchema = z.enum(["off", "daily", "weekly", "biweekly"]);
export const updateHealthSchema = z.enum(["on_track", "at_risk", "off_track"]);

const targetDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Fractional position key, same rule as milestones
 * (src/lib/validation/projects-milestones.ts). Optional on write: create
 * appends after the last sibling, and a patch that omits it leaves the order
 * alone. An explicit key inserts between two projects (T-028).
 */
const positionSchema = z
  .string()
  .max(64)
  .refine((key) => isValidKey(key), "invalid fractional position key");

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(256),
  descriptionMd: z.string().max(100_000).nullable().optional(),
  status: projectStatusSchema.optional(),
  leadId: z.string().min(1).nullable().optional(),
  targetStartDate: targetDateSchema.nullable().optional(),
  targetEndDate: targetDateSchema.nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  briefPageId: z.string().min(1).nullable().optional(),
  updateCadence: updateCadenceSchema.optional(),
});

export const patchProjectSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  descriptionMd: z.string().max(100_000).nullable().optional(),
  status: projectStatusSchema.optional(),
  leadId: z.string().min(1).nullable().optional(),
  targetStartDate: targetDateSchema.nullable().optional(),
  targetEndDate: targetDateSchema.nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  briefPageId: z.string().min(1).nullable().optional(),
  updateCadence: updateCadenceSchema.optional(),
  archived: z.boolean().optional(),
  position: positionSchema.optional(),
});

export const createProjectUpdateSchema = z.object({
  health: updateHealthSchema,
  bodyMd: z.string().trim().min(1).max(20_000),
  progressSnapshot: z.number().int().min(0).max(100).optional(),
});
