/**
 * Island API client (architecture §3): same-origin fetch, exact error
 * shape {error:{code,message,details}} surfaced as ApiError.
 */

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: string[];
  /** Seconds, from a 429 Retry-After header (AT-003). */
  readonly retryAfter: number | null;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details: string[] = [],
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: string[] };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("INTERNAL", "Network request failed", 0);
  }

  if (!response.ok) {
    let code: ApiErrorCode = "INTERNAL";
    let message = `Request failed (${response.status})`;
    let details: string[] = [];
    try {
      const body = (await response.json()) as ErrorBody;
      if (body.error) {
        code = (body.error.code as ApiErrorCode) ?? code;
        message = body.error.message ?? message;
        details = body.error.details ?? details;
      }
    } catch {
      // Non-JSON body — keep the generic fallbacks above.
    }
    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfter = retryAfterRaw !== null ? Number(retryAfterRaw) : null;
    throw new ApiError(
      code,
      message,
      response.status,
      details,
      Number.isFinite(retryAfter) ? (retryAfter as number) : null,
    );
  }

  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  // Same-origin POST: the browser attaches Origin/cookies itself; the
  // middleware CSRF check passes (or allows cookie+no-Origin requests).
  return request<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}
