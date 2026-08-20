/**
 * The 19 block types and their props contracts (architecture §2.6, binding).
 *
 * One row per type. Each row declares the four things the rest of the module
 * needs to know about that type, so they cannot drift apart:
 *
 *   props     zod schema for the stored props object (structure)
 *   children  §2.6's "children allowed" column, the only nest rule
 *   clean     sanitizes richText inside the props and derives the plain text
 *             that lands in `blocks.text` and feeds the page's FTS body (§2.10)
 *
 * `clean` returns props and text together on purpose. They are two views of
 * one value, so deriving both in one function removes the possibility of the
 * search index disagreeing with the document.
 *
 * The 19 names are also a CHECK constraint on the blocks table in
 * src/db/schema.ts, which this ticket does not own. tests/api/blocks-spec
 * pins the two lists to each other.
 */
import { z } from "zod";
import { HttpError } from "@/lib/api/errors";
import {
  isAllowedLinkUrl,
  richTextSchema,
  richTextToPlain,
  sanitizeRichText,
  type MentionResolver,
  type RichTextNode,
} from "./blocks-richtext";

/** A URL stored in props (image/file/bookmark/embed), same schemes as marks. */
const urlSchema = z.string().max(2048).refine(isAllowedLinkUrl, "url scheme must be http, https or mailto");

interface BlockSpec<S extends z.ZodTypeAny> {
  readonly props: S;
  readonly children: boolean;
  readonly clean: (props: z.infer<S>, mentions: MentionResolver) => { props: z.infer<S>; text: string };
}

/** Identity spec helper: preserves the schema's inferred type through the table. */
function spec<S extends z.ZodTypeAny>(s: BlockSpec<S>): BlockSpec<S> {
  return s;
}

/**
 * The shape shared by every text-bearing type: `props.text` is richText, and
 * cleaning means sanitizing that run and extracting its plain text.
 */
function textual<S extends z.ZodObject<{ text: typeof richTextSchema }, "strict">>(
  schema: S,
  children: boolean,
): BlockSpec<S> {
  return spec({
    props: schema,
    children,
    clean: (props, mentions) => {
      const text = sanitizeRichText(props.text, mentions);
      return { props: { ...props, text } as z.infer<S>, text: richTextToPlain(text) };
    },
  });
}

/** Types whose props carry no richText: nothing to sanitize, text derived directly. */
function plain<S extends z.ZodTypeAny>(schema: S, text: (props: z.infer<S>) => string): BlockSpec<S> {
  return spec({ props: schema, children: false, clean: (props) => ({ props, text: text(props) }) });
}

const textOnly = z.object({ text: richTextSchema }).strict();
const fileRefSchema = z
  .object({
    path: z.string().max(1024),
    name: z.string().max(256),
    size: z.number().int().nonnegative(),
    mime: z.string().max(128),
  })
  .strict();

export const BLOCK_SPECS = {
  paragraph: textual(z.object({ text: richTextSchema, color: z.string().max(32).optional() }).strict(), false),
  heading_1: textual(textOnly, false),
  heading_2: textual(textOnly, false),
  heading_3: textual(textOnly, false),
  bulleted_list: textual(textOnly, true),
  numbered_list: textual(textOnly, true),
  todo: textual(z.object({ text: richTextSchema, checked: z.boolean() }).strict(), true),
  toggle: textual(z.object({ text: richTextSchema, collapsed: z.boolean() }).strict(), true),
  quote: textual(textOnly, false),
  callout: textual(z.object({ text: richTextSchema, emoji: z.string().max(16) }).strict(), false),
  divider: plain(z.object({}).strict(), () => ""),
  code: plain(
    z.object({ code: z.string().max(100_000), language: z.string().max(32), wrap: z.boolean() }).strict(),
    (p) => p.code,
  ),
  image: plain(
    z.object({ url: urlSchema, caption: z.string().max(1_000).optional(), file: fileRefSchema.optional() }).strict(),
    (p) => p.caption ?? "",
  ),
  file: plain(
    z
      .object({
        url: urlSchema,
        name: z.string().max(256),
        size: z.number().int().nonnegative().optional(),
        mime: z.string().max(128).optional(),
      })
      .strict(),
    (p) => p.name,
  ),
  bookmark: plain(
    z
      .object({
        url: urlSchema,
        title: z.string().max(512),
        description: z.string().max(2_000),
        icon: z.string().max(2048),
      })
      .strict(),
    (p) => `${p.title} ${p.description}`.trim(),
  ),
  embed: plain(
    z.object({ url: urlSchema, provider: z.string().max(64), aspect: z.number().positive().optional() }).strict(),
    () => "",
  ),
  // §2.6: cells are stored inline in props, never as child blocks.
  table: spec({
    props: z.object({ rows: z.array(z.array(richTextSchema)).max(500), headerRow: z.boolean() }).strict(),
    children: false,
    clean: (props, mentions) => {
      const rows = props.rows.map((row) => row.map((cell) => sanitizeRichText(cell, mentions)));
      return { props: { ...props, rows }, text: rows.flat().map(richTextToPlain).join(" ").trim() };
    },
  }),
  // §2.6 + ux-spec ED-09: an issue_view embeds a saved VIEW, not an issue.
  issue_view: plain(
    z.object({ viewId: z.string().min(1).max(64), layout: z.enum(["list", "board", "table"]).optional() }).strict(),
    () => "",
  ),
  page_link: plain(
    z
      .object({ pageId: z.string().min(1).max(64), title: z.string().max(512), icon: z.string().max(16).nullable() })
      .strict(),
    (p) => p.title,
  ),
} as const;

export type BlockType = keyof typeof BLOCK_SPECS;

export const BLOCK_TYPES = Object.keys(BLOCK_SPECS) as BlockType[];

export function isBlockType(value: string): value is BlockType {
  return Object.hasOwn(BLOCK_SPECS, value);
}

/** §2.6's "children allowed" column, read straight off the table. */
export function childrenAllowed(type: BlockType): boolean {
  return BLOCK_SPECS[type].children;
}

/** The four container types, derived rather than restated. */
export const CHILD_BEARING: ReadonlySet<BlockType> = new Set(BLOCK_TYPES.filter(childrenAllowed));

declare const SANITIZED: unique symbol;

/**
 * The only value the block writer accepts. The brand is a module-private
 * unique symbol, so no other module can construct one and no write path can
 * reach the blocks table with props that skipped `sanitizeBlock`.
 */
export interface SanitizedBlock {
  readonly [SANITIZED]: true;
  readonly type: BlockType;
  /** Sanitized props, ready to JSON.stringify into blocks.props. */
  readonly props: unknown;
  /** Derived plain text for blocks.text (§2.10 FTS body). */
  readonly text: string;
}

function detailsOf(error: z.ZodError, at: string): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${at}.${path}: ${issue.message}` : `${at}: ${issue.message}`;
  });
}

/**
 * Parse and sanitize one block's payload. The single constructor of
 * `SanitizedBlock`, and therefore the single gate every write passes.
 *
 * Structural problems (unknown type, wrong props shape) throw VALIDATION.
 * Content problems named in T-007's acceptance (unknown mark, bad link
 * scheme, non-member mention) are sanitized instead, per ./blocks-richtext.
 *
 * `at` prefixes the error details so a batch can say which op failed.
 */
export function sanitizeBlock(
  input: { type: string; props: unknown },
  mentions: MentionResolver,
  at = "block",
): SanitizedBlock {
  if (!isBlockType(input.type)) {
    throw new HttpError("VALIDATION", "Unknown block type", [`${at}.type: ${input.type}`]);
  }
  const entry = BLOCK_SPECS[input.type];
  const parsed = entry.props.safeParse(input.props);
  if (!parsed.success) {
    throw new HttpError("VALIDATION", "Validation failed", detailsOf(parsed.error, `${at}.props`));
  }
  // The spec table is `as const` and indexed by the literal `input.type` just
  // narrowed above, so props and clean belong to the same row by construction.
  // TypeScript cannot express that through a dynamic key, so the pairing is
  // asserted once, here, and nowhere else.
  const clean = (entry.clean as (p: unknown, m: MentionResolver) => { props: unknown; text: string })(
    parsed.data,
    mentions,
  );
  return { type: input.type, props: clean.props, text: clean.text } as SanitizedBlock;
}

export type { RichTextNode };
