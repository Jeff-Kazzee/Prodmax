import { z } from "zod";

export const createCycleSchema = z
  .object({
    teamId: z.string().min(1),
    number: z.number().int().min(1).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    startsAt: z.number().int(),
    endsAt: z.number().int(),
  })
  .refine((v) => v.startsAt < v.endsAt, {
    message: "startsAt must be before endsAt",
    path: ["startsAt"],
  });

export const patchCycleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  startsAt: z.number().int().optional(),
  endsAt: z.number().int().optional(),
});

export const cycleScopeSchema = z.object({
  add: z.array(z.string().min(1)).max(500).optional(),
  remove: z.array(z.string().min(1)).max(500).optional(),
});
