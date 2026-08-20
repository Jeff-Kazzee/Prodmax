/**
 * Template schemas (architecture §2.7).
 *
 * Named `pages-templates` to sit inside T-007's owns glob
 * (src/lib/validation/{pages,blocks}*), matching the existing
 * `projects-milestones.ts` precedent for a satellite entity's schemas.
 *
 * `data` is a JSON blob whose shape depends on `kind`, so it is parsed by a
 * discriminated schema rather than stored as free JSON. A template is authored
 * once and instantiated many times; letting a malformed blob in would turn one
 * bad write into a permanently broken gallery card.
 */
import { z } from "zod";
import { isValidKey } from "@/db/positions";

/** §2.7: page templates carry a block tree. Depth and node count are capped. */
export const MAX_TEMPLATE_NODES = 1_000;
const MAX_TEMPLATE_DEPTH = 10;

export interface TemplateBlockNode {
  type: string;
  /**
   * Optional in the type because `z.unknown()` admits `undefined`, and the
   * inferred shape has to match this interface for the recursive schema to
   * typecheck. A node that omits props still fails at instantiate time, where
   * the per-type contract in validation/blocks rejects it by name.
   */
  props?: unknown;
  children?: TemplateBlockNode[];
}

/**
 * Recursive block node. Props are `unknown` here on purpose: the per-type
 * contract lives in validation/blocks and is applied by `sanitizeBlock` when
 * the template is instantiated, not when it is stored. Validating twice
 * against one contract is how the two copies drift.
 */
export const templateBlockNodeSchema: z.ZodType<TemplateBlockNode> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1).max(32),
      props: z.unknown(),
      children: z.array(templateBlockNodeSchema).max(200).optional(),
    })
    .strict(),
);

export const pageTemplateDataSchema = z
  .object({
    icon: z.string().max(16).nullable().optional(),
    blocks: z.array(templateBlockNodeSchema).max(MAX_TEMPLATE_NODES),
  })
  .strict();

export const issueTemplateDataSchema = z
  .object({
    title: z.string().max(512).optional(),
    descriptionMd: z.string().max(100_000).optional(),
    priority: z.number().int().min(0).max(4).optional(),
    stateId: z.string().min(1).max(64).optional(),
    labels: z.array(z.string().min(1).max(64)).max(50).optional(),
    subIssues: z.array(z.object({ title: z.string().max(512) }).strict()).max(50).optional(),
  })
  .strict();

const positionSchema = z.string().max(64).refine(isValidKey, "invalid fractional position key");

export const createTemplateSchema = z
  .object({
    kind: z.enum(["issue", "page"]),
    name: z.string().trim().min(1).max(256),
    description: z.string().max(2_000).nullable().optional(),
    teamId: z.string().min(1).max(64).nullable().optional(),
    data: z.unknown(),
    position: positionSchema.optional(),
  })
  .strict();

export const patchTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(256).optional(),
    description: z.string().max(2_000).nullable().optional(),
    teamId: z.string().min(1).max(64).nullable().optional(),
    data: z.unknown().optional(),
    position: positionSchema.optional(),
  })
  .strict();

export const instantiateTemplateSchema = z
  .object({
    parentId: z.string().min(1).max(64).nullable().optional(),
    title: z.string().max(512).optional(),
  })
  .strict();

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type PatchTemplateInput = z.infer<typeof patchTemplateSchema>;
export type InstantiateTemplateInput = z.infer<typeof instantiateTemplateSchema>;
export type PageTemplateData = z.infer<typeof pageTemplateDataSchema>;
export type IssueTemplateData = z.infer<typeof issueTemplateDataSchema>;

/** Total nodes in a template block tree, children included. */
export function countTemplateNodes(nodes: readonly TemplateBlockNode[], depth = 0): number {
  if (depth > MAX_TEMPLATE_DEPTH) {
    throw new Error(`template block tree deeper than ${MAX_TEMPLATE_DEPTH}`);
  }
  return nodes.reduce((n, node) => n + 1 + countTemplateNodes(node.children ?? [], depth + 1), 0);
}
