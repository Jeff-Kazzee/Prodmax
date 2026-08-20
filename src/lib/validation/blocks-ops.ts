/**
 * Request schemas for the block write endpoints (architecture §3.6).
 *
 * Placement is expressed as intent, never as a position key: the client says
 * "after X" or "before Y" and the server computes the fractional key (§2.10,
 * "server assigns; client sends intent"). A client-supplied `position` is not
 * accepted anywhere, so two clients cannot race to the same key.
 *
 * `insert` carries a client-chosen id. ux-spec ED-12 flushes the offline queue
 * as one batch on reconnect, and the client has already rendered those blocks
 * optimistically under ids it chose. Server-assigned ids would make a replayed
 * flush create duplicates; a client id lets the replay converge instead.
 */
import { z } from "zod";

/** Batch cap. Oversize batches are 413, not 400: the payload is the problem. */
export const MAX_BATCH_OPS = 500;

/**
 * Ids are uuid7 in production but seeds and tests use readable ids, so the
 * rule is a conservative character class rather than a uuid pattern.
 */
const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "id must be url-safe");

const placement = {
  parentId: idSchema.nullable().optional(),
  afterId: idSchema.nullable().optional(),
  beforeId: idSchema.nullable().optional(),
};

/** POST /api/pages/:pageId/blocks */
export const createBlockSchema = z
  .object({
    id: idSchema.optional(),
    type: z.string().min(1).max(32),
    props: z.unknown(),
    ...placement,
  })
  .strict();

/**
 * PATCH /api/blocks/:id. Props edit, turn-into, and reparent/reorder.
 *
 * A type change must bring props with it. The props contract is per type
 * (§2.6), so accepting a bare `type` would leave the row holding props that
 * no longer validate against it, which is the one state the table must not
 * reach.
 */
export const patchBlockSchema = z
  .object({
    type: z.string().min(1).max(32).optional(),
    props: z.unknown().optional(),
    ...placement,
  })
  .strict()
  .refine((v) => v.type === undefined || v.props !== undefined, {
    message: "props is required when type changes",
    path: ["props"],
  });

const insertOpSchema = z
  .object({ op: z.literal("insert"), id: idSchema, type: z.string().min(1).max(32), props: z.unknown(), ...placement })
  .strict();

const updateOpSchema = z
  .object({ op: z.literal("update"), id: idSchema, type: z.string().min(1).max(32).optional(), props: z.unknown() })
  .strict();

const moveOpSchema = z.object({ op: z.literal("move"), id: idSchema, ...placement }).strict();

const deleteOpSchema = z.object({ op: z.literal("delete"), id: idSchema }).strict();

export const blockOpSchema = z.discriminatedUnion("op", [
  insertOpSchema,
  updateOpSchema,
  moveOpSchema,
  deleteOpSchema,
]);

export type BlockOp = z.infer<typeof blockOpSchema>;
export type InsertOp = z.infer<typeof insertOpSchema>;

/**
 * POST /api/pages/:pageId/blocks/batch.
 *
 * The size cap is enforced in `applyBlockOps` so it can answer 413 rather than
 * the 400 a zod `.max()` would produce; the schema keeps a hard ceiling well
 * above it so a hostile payload cannot be parsed into memory unbounded.
 */
export const blockBatchSchema = z
  .object({ ops: z.array(blockOpSchema).min(1).max(MAX_BATCH_OPS * 4) })
  .strict();
