/**
 * Request-body parsing + validation (§3): zod schema in, typed value out.
 * Failure throws HttpError VALIDATION with zod issue details → 400.
 */
import type { z } from "zod";
import { HttpError } from "./errors";

/** Parse `request` body as JSON; on schema failure throws 400 VALIDATION. */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new HttpError("VALIDATION", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    throw new HttpError("VALIDATION", "Validation failed", details);
  }
  return result.data;
}

/** Parse an optional JSON body ({} when absent); same 400 semantics. */
export async function parseBodyOptional<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const text = await request.text();
  if (text.trim().length === 0) {
    const result = schema.safeParse({});
    if (!result.success) {
      throw new HttpError(
        "VALIDATION",
        "Validation failed",
        result.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
      );
    }
    return result.data;
  }
  return parseBody(
    new Request(request.url, { method: "POST", body: text, headers: request.headers }),
    schema,
  );
}

/** Parse a JSON body returning null when the request has no body. */
export async function parseJsonLoose(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim().length === 0 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}
