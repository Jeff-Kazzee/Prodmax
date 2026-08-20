/**
 * Templates service (M5a, architecture §2.7 + §3.6).
 *
 * `POST /api/templates/:id/instantiate` behaves differently per kind, and the
 * issue case deserves its reason written down. §3.6's table glosses it as
 * "issue -> new issue", while T-007's deliverable says "issue kind ->
 * prefilled issue payload". This follows the ticket, and not only because the
 * ticket is the work order:
 *
 *   - tests/api/projects-choke-point.test.ts asserts that the set of files
 *     writing the `issues` table is exactly one, with a total of zero
 *     violations. Creating an issue here would turn that gate red.
 *   - The legitimate way in is `runIssueWrite`, which lives in M1/M3-owned
 *     files outside this ticket's owns list.
 *   - Architecture §9 is explicit that an issue created outside that choke
 *     point does not drive the progress-delta consumer, and because reads
 *     never recompute, nothing self-heals.
 *
 * So instantiate returns the payload the client posts to /api/issues, which is
 * the path the counters already understand. §3.6's row wants a wording
 * amendment; the divergence is recorded in the ticket rather than silently
 * resolved either way.
 */
import { and, asc, eq } from "drizzle-orm";
import { templates } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import { sanitizeBlock } from "@/lib/validation/blocks";
import {
  countTemplateNodes,
  issueTemplateDataSchema,
  MAX_TEMPLATE_NODES,
  pageTemplateDataSchema,
  type CreateTemplateInput,
  type InstantiateTemplateInput,
  type IssueTemplateData,
  type PageTemplateData,
  type PatchTemplateInput,
  type TemplateBlockNode,
} from "@/lib/validation/pages-templates";
import { workspaceMentions, type DocsCtx } from "./pages-access";
import { createPage, type PageDto } from "./pages";
import {
  insertBlockRow,
  readPageBlockRows,
  resolvePlacement,
  siblingViewOf,
  toBlockDto,
  type BlockDto,
} from "./blocks-write";

type TemplateRow = typeof templates.$inferSelect;

export interface TemplateDto {
  id: string;
  kind: "issue" | "page";
  name: string;
  description: string | null;
  teamId: string | null;
  data: unknown;
  position: string;
  usageCount: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

function toTemplateDto(row: TemplateRow): TemplateDto {
  let data: unknown = {};
  try {
    data = JSON.parse(row.data) as unknown;
  } catch {
    /* a corrupt blob reads as empty rather than failing the gallery */
  }
  return {
    id: row.id,
    kind: row.kind as "issue" | "page",
    name: row.name,
    description: row.description,
    teamId: row.teamId,
    data,
    position: row.position,
    usageCount: row.usageCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Validate `data` against the schema for its kind, returning the stored JSON. */
function encodeData(kind: "issue" | "page", data: unknown): string {
  if (kind === "issue") {
    const parsed = issueTemplateDataSchema.safeParse(data ?? {});
    if (!parsed.success) throw validationError(parsed.error.issues, "data");
    return JSON.stringify(parsed.data);
  }
  const parsed = pageTemplateDataSchema.safeParse(data ?? { blocks: [] });
  if (!parsed.success) throw validationError(parsed.error.issues, "data");
  if (countTemplateNodes(parsed.data.blocks) > MAX_TEMPLATE_NODES) {
    throw new HttpError("VALIDATION", `A page template carries at most ${MAX_TEMPLATE_NODES} blocks`);
  }
  return JSON.stringify(parsed.data);
}

function validationError(issues: Array<{ path: PropertyKey[]; message: string }>, at: string): HttpError {
  return new HttpError(
    "VALIDATION",
    "Validation failed",
    issues.map((i) => (i.path.length > 0 ? `${at}.${i.path.join(".")}: ${i.message}` : `${at}: ${i.message}`)),
  );
}

export function requireTemplate(ctx: DocsCtx, id: string): TemplateRow {
  const row = currentDb().select().from(templates).where(eq(templates.id, id)).get();
  if (!row || row.workspaceId !== ctx.wsId) throw new HttpError("NOT_FOUND", "Template not found");
  return row;
}

export function listTemplates(ctx: DocsCtx, kind?: "issue" | "page"): TemplateDto[] {
  return currentDb()
    .select()
    .from(templates)
    .where(
      kind === undefined
        ? eq(templates.workspaceId, ctx.wsId)
        : and(eq(templates.workspaceId, ctx.wsId), eq(templates.kind, kind)),
    )
    .orderBy(asc(templates.position))
    .all()
    .map(toTemplateDto);
}

function nextPosition(ctx: DocsCtx): string {
  const last =
    currentDb()
      .select({ position: templates.position })
      .from(templates)
      .where(eq(templates.workspaceId, ctx.wsId))
      .all()
      .map((r) => r.position)
      .sort()
      .at(-1) ?? null;
  return generateKeyBetween(last, null);
}

export function createTemplate(ctx: DocsCtx, input: CreateTemplateInput): TemplateDto {
  const id = uuid7();
  const now = Date.now();
  currentDb()
    .insert(templates)
    .values({
      id,
      workspaceId: ctx.wsId,
      teamId: input.teamId ?? null,
      kind: input.kind,
      name: input.name,
      description: input.description ?? null,
      data: encodeData(input.kind, input.data),
      position: input.position ?? nextPosition(ctx),
      recurrence: null,
      usageCount: 0,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return toTemplateDto(requireTemplate(ctx, id));
}

export function patchTemplate(ctx: DocsCtx, id: string, input: PatchTemplateInput): TemplateDto {
  const row = requireTemplate(ctx, id);
  const patch: Partial<typeof templates.$inferInsert> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.teamId !== undefined) patch.teamId = input.teamId;
  if (input.position !== undefined) patch.position = input.position;
  if (input.data !== undefined) patch.data = encodeData(row.kind as "issue" | "page", input.data);
  currentDb().update(templates).set(patch).where(eq(templates.id, row.id)).run();
  return toTemplateDto(requireTemplate(ctx, id));
}

/** Hard delete: `templates` carries no deleted_at, and adding one needs a migration. */
export function deleteTemplate(ctx: DocsCtx, id: string): { id: string } {
  const row = requireTemplate(ctx, id);
  currentDb().delete(templates).where(eq(templates.id, row.id)).run();
  return { id: row.id };
}

export type InstantiateResult =
  | { kind: "issue"; payload: IssueTemplateData }
  | { kind: "page"; page: PageDto; blocks: BlockDto[] };

export function instantiateTemplate(
  ctx: DocsCtx,
  id: string,
  input: InstantiateTemplateInput,
): InstantiateResult {
  const row = requireTemplate(ctx, id);
  const bumpUsage = () =>
    currentDb()
      .update(templates)
      .set({ usageCount: row.usageCount + 1, updatedAt: Date.now() })
      .where(eq(templates.id, row.id))
      .run();

  if (row.kind === "issue") {
    const parsed = issueTemplateDataSchema.safeParse(JSON.parse(row.data) as unknown);
    if (!parsed.success) throw validationError(parsed.error.issues, "data");
    bumpUsage();
    // A payload, not a row. See the module header for why.
    return { kind: "issue", payload: { ...parsed.data, ...(input.title ? { title: input.title } : {}) } };
  }

  const parsed = pageTemplateDataSchema.safeParse(JSON.parse(row.data) as unknown);
  if (!parsed.success) throw validationError(parsed.error.issues, "data");
  const data: PageTemplateData = parsed.data;

  const page = createPage(ctx, {
    parentId: input.parentId ?? null,
    title: input.title ?? row.name,
    icon: data.icon ?? null,
  });

  const mentions = workspaceMentions(ctx);
  const now = Date.now();
  currentDb().transaction(() => {
    cloneNodes(ctx, page.id, data.blocks, null, mentions, now);
    bumpUsage();
  });

  return { kind: "page", page, blocks: readPageBlockRows(ctx, page.id).map(toBlockDto) };
}

/**
 * Clone a template block tree onto a fresh page.
 *
 * Every node is re-sanitized rather than trusted. A stored template is JSON
 * authored at some earlier time, possibly before a sanitizer fix, so trusting
 * it would make the template table a way to write props that no live endpoint
 * would accept.
 */
function cloneNodes(
  ctx: DocsCtx,
  pageId: string,
  nodes: readonly TemplateBlockNode[],
  parentId: string | null,
  mentions: ReturnType<typeof workspaceMentions>,
  now: number,
): void {
  let afterId: string | null = null;
  for (const [i, node] of nodes.entries()) {
    const at = `blocks[${i}]`;
    const block = sanitizeBlock({ type: node.type, props: node.props }, mentions, at);
    const view = siblingViewOf(readPageBlockRows(ctx, pageId));
    const placement = resolvePlacement(view, { parentId, afterId }, undefined, at);
    const id = uuid7();
    insertBlockRow(ctx, pageId, id, block, placement, now);
    afterId = id;
    if (node.children && node.children.length > 0) {
      cloneNodes(ctx, pageId, node.children, id, mentions, now);
    }
  }
}
