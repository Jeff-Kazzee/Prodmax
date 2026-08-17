/**
 * Cursor pagination (§3): `{ data, nextCursor }`; cursors are opaque
 * base64url offsets, stable for in-memory slices. limit capped at 100.
 */
import { HttpError } from "./errors";

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 50;

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    const o = parsed.o;
    if (typeof o === "number" && Number.isInteger(o) && o >= 0) return o;
  } catch {
    /* fallthrough */
  }
  throw new HttpError("VALIDATION", "Invalid cursor");
}

/** Clamp `?limit=` and validate `?cursor=` for a request. */
export function pageParams(url: URL): { limit: number; offset: number } {
  const rawLimit = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) {
      throw new HttpError("VALIDATION", "limit must be a positive integer");
    }
    limit = Math.min(n, MAX_LIMIT);
  }
  const rawCursor = url.searchParams.get("cursor");
  const offset = rawCursor !== null ? decodeCursor(rawCursor) : 0;
  return { limit, offset };
}

/** Slice `list` by cursor/limit, emitting `nextCursor` when more remain. */
export function paginate<T>(list: readonly T[], cursor: string | null, limit: number): Page<T> {
  const max = Math.min(Math.max(Math.trunc(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = cursor !== null ? decodeCursor(cursor) : 0;
  const data = list.slice(offset, offset + max);
  const nextCursor = offset + max < list.length ? encodeCursor(offset + max) : null;
  return { data, nextCursor };
}
