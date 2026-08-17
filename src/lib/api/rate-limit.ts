/**
 * In-memory fixed-window rate limiter (M1b). Single-process only —
 * fine for v1 (Node adapter, one server). Login: 10 / 5 min / email+IP.
 */
import { HttpError } from "./errors";

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

/** Sweep expired buckets occasionally so the map cannot grow unbounded. */
function sweep(now: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, state] of buckets) {
    if (state.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

/**
 * Count one hit against `key`. Throws 429 RATE_LIMITED (via route()) when
 * the window is exhausted; otherwise returns the remaining budget.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const state = buckets.get(key);
  if (!state || state.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, resetAt: now + windowMs, retryAfterSeconds: 0 };
  }
  if (state.count >= max) {
    return {
      ok: false,
      remaining: 0,
      resetAt: state.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    };
  }
  state.count += 1;
  return {
    ok: true,
    remaining: max - state.count,
    resetAt: state.resetAt,
    retryAfterSeconds: 0,
  };
}

/** Enforce a limit; throws the 429 response on exhaustion. */
export function enforceRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const result = rateLimit(key, max, windowMs);
  if (!result.ok) {
    throw new HttpError("RATE_LIMITED", "Too many requests; slow down and retry", [
      `retry-after: ${result.retryAfterSeconds}`,
    ]);
  }
  return result;
}

/** Test hook: forget all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}
