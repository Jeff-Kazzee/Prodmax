import { z } from "zod";
import { isValidKey } from "@/db/positions";

/** YYYY-MM-DD calendar date (same rule as issues dueDate). */
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Fractional position key (src/db/positions.ts). Optional on write: the
 * service appends after the last live sibling when omitted. Explicit keys
 * let a caller insert between two milestones (midpoint of their keys).
 */
const positionSchema = z
  .string()
  .max(64)
  .refine((key) => isValidKey(key), "invalid fractional position key");

export const createMilestoneSchema = z.object({
  name: z.string().trim().min(1).max(200),
  targetDate: dateSchema.nullable().optional(),
  position: positionSchema.optional(),
});

export const patchMilestoneSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  targetDate: dateSchema.nullable().optional(),
  position: positionSchema.optional(),
});
