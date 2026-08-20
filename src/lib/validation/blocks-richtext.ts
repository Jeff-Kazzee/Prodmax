/**
 * richText model and its sanitizer (architecture §2.6, binding).
 *
 * §2.6 states the rule this module exists to enforce: text nodes are rendered
 * as text and never as innerHTML, and link URLs are scheme-validated to
 * http/https/mailto. Marks outside the documented set do not exist.
 *
 * Sanitize, do not reject. T-007's acceptance names "bad scheme, unknown mark,
 * non-member mention" as *sanitize cases*, so each one is cleaned and the
 * surrounding text survives: an unknown mark is dropped, a bad link scheme
 * drops the link mark, and a mention that does not resolve inside this
 * workspace degrades to a plain text node carrying its label. Rejecting
 * instead would mean one bad paste 400s an entire page save. Structurally
 * invalid input (unknown block type, wrong props shape) is a different class
 * and still 400s at the zod boundary in ./blocks.
 *
 * The zod schema here validates *structure only*. Mark contents arrive as an
 * open record and are narrowed by `sanitizeRichText`, because a `.strict()`
 * schema would reject the unknown mark this module is required to strip.
 */
import { z } from "zod";

/** The five marks §2.6 documents. Nothing else is representable. */
export const ALLOWED_MARKS = ["bold", "italic", "strike", "code", "link"] as const;
export type MarkName = (typeof ALLOWED_MARKS)[number];

/** §2.6: link URLs are scheme-validated to exactly these three. */
export const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"] as const;

export const MAX_TEXT_NODE_CHARS = 20_000;
export const MAX_RICHTEXT_NODES = 2_000;

/**
 * A type alias rather than an interface on purpose: an interface gets no
 * implicit index signature, so it would not satisfy the open
 * `Record<string, unknown>` the parser produces, and the sanitized value
 * could not flow back into a props object typed from the zod schema.
 */
export type RichTextMarks = {
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  /** Absolute URL, already scheme-checked. */
  link?: string;
};

export interface RichTextText {
  type: "text";
  text: string;
  marks?: RichTextMarks;
}

export type MentionTarget = "user" | "issue" | "page";

export interface RichTextMention {
  type: "mention";
  target: MentionTarget;
  id: string;
  label: string;
}

export type RichTextNode = RichTextText | RichTextMention;

/**
 * Structure-only schema. `marks` is an open record on purpose: narrowing
 * happens in `sanitizeRichText`, which must be able to see and drop an
 * unknown mark rather than fail the parse.
 */
const richTextNodeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().max(MAX_TEXT_NODE_CHARS),
    marks: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("mention"),
    target: z.enum(["user", "issue", "page"]),
    id: z.string().min(1).max(64),
    label: z.string().max(256),
  }),
]);

export const richTextSchema = z.array(richTextNodeSchema).max(MAX_RICHTEXT_NODES);

/** What the parser produces before sanitizing: shape is known, content is not. */
export type RawRichText = z.infer<typeof richTextSchema>;

/**
 * Resolves mention targets against the caller's workspace. Implemented in the
 * service layer, where DB access lives (AGENTS.md: better-sqlite3 sync calls
 * in the service layer only). A mention whose target does not resolve is not
 * an error, it is a mention that degrades to text.
 */
export interface MentionResolver {
  exists(target: MentionTarget, id: string): boolean;
}

/** Nothing resolves. Used by pure unit tests and by callers with no workspace. */
export const NO_MENTIONS: MentionResolver = { exists: () => false };

/**
 * True when `raw` parses as an absolute URL with an allowed scheme.
 *
 * Parsed with the URL constructor rather than matched with a regex, so
 * `javascript:` cannot be smuggled through case tricks, whitespace or
 * embedded credentials. A relative URL has no scheme and is refused: §2.6
 * lists three schemes and a bare path is none of them.
 */
export function isAllowedLinkUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return (ALLOWED_LINK_SCHEMES as readonly string[]).includes(parsed.protocol);
}

/**
 * Narrow an open mark record to the documented set.
 *
 * Boolean marks are kept only when literally `true`, so `{bold: false}` and
 * `{bold: "yes"}` both vanish rather than becoming truthy downstream. `link`
 * is kept only when it is a string with an allowed scheme; a rejected link
 * drops the mark and leaves the text, which is the §2.6 "rendered as text"
 * outcome.
 */
function sanitizeMarks(raw: Record<string, unknown> | undefined): RichTextMarks | undefined {
  if (raw === undefined) return undefined;
  const clean: RichTextMarks = {};
  for (const name of ALLOWED_MARKS) {
    const value = raw[name];
    if (name === "link") {
      if (typeof value === "string" && isAllowedLinkUrl(value)) clean.link = value;
      continue;
    }
    if (value === true) clean[name] = true;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/**
 * The sanitizer. Every richText value reaching the database passes through
 * here exactly once, via `sanitizeBlock` in ./blocks.
 *
 * A mention that does not resolve becomes `{type:'text', text: label}`. It
 * keeps the label because the author wrote something meaningful and dropping
 * it would silently delete their words; it loses the id because a dangling id
 * would render as a link to nothing and would leak that some id exists.
 */
export function sanitizeRichText(nodes: RawRichText, mentions: MentionResolver): RichTextNode[] {
  const out: RichTextNode[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      const marks = sanitizeMarks(node.marks);
      out.push(marks === undefined ? { type: "text", text: node.text } : { type: "text", text: node.text, marks });
      continue;
    }
    if (mentions.exists(node.target, node.id)) {
      out.push({ type: "mention", target: node.target, id: node.id, label: node.label });
      continue;
    }
    out.push({ type: "text", text: node.label });
  }
  return out;
}

/**
 * Plain text of a richText run, for the `blocks.text` column that feeds the
 * page's FTS body (§2.10). Mention labels are included so a page stays
 * findable by the name the author typed.
 */
export function richTextToPlain(nodes: readonly RichTextNode[]): string {
  return nodes
    .map((n) => (n.type === "text" ? n.text : n.label))
    .filter((s) => s.length > 0)
    .join(" ");
}
