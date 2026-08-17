/**
 * API response + error conventions (architecture §3, binding).
 *
 * Error shape (exact): { "error": { "code", "message", "details" } }
 * Codes: AUTH_REQUIRED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409,
 * VALIDATION 400, RATE_LIMITED 429, PAYLOAD_TOO_LARGE 413, INTERNAL 500.
 */

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL";

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
};

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details: string[] };
}

/** Thrown by guards/handlers; converted to the exact shape by `route`. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: string[];

  constructor(code: ErrorCode, message: string, details: string[] = [], status?: number) {
    super(message);
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
    this.details = details;
  }
}

/** Success JSON response. */
export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headersInit(headers) },
  });
}

/** Error response in the exact §3 shape. */
export function apiError(
  code: ErrorCode,
  message: string,
  details: string[] = [],
  status?: number,
): Response {
  const body: ApiErrorBody = {
    error: { code, message, details: details.length > 0 ? details : [] },
  };
  return new Response(JSON.stringify(body), {
    status: status ?? STATUS_BY_CODE[code],
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function headersInit(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

type Handler = (ctx: unknown) => Response | Promise<Response>;

/**
 * Wrap an API route so thrown HttpErrors become the exact error shape.
 * Unknown throwables become INTERNAL 500 without leaking details.
 */
export function route(handler: Handler): (ctx: unknown) => Promise<Response> {
  return async (ctx: unknown) => {
    try {
      return await handler(ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return apiError(err.code, err.message, err.details, err.status);
      }
      console.error("[api] unhandled error:", err);
      return apiError("INTERNAL", "Internal server error");
    }
  };
}
