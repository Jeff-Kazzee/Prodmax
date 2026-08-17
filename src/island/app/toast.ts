/**
 * Shared toast helper (design-system §19): result-first copy, mono meta,
 * ERR-std error mapping. Danger persists 8s, others 4.5s; max 3 visible
 * (configured on the mounted <Toaster> in app.tsx).
 */
import { toast } from "sonner";
import { ApiError } from "./api";

export function toastOk(message: string, meta?: string): void {
  toast.success(message, {
    description: meta,
    duration: 4500,
  });
}

export function toastErr(message: string, meta?: string): void {
  toast.error(message, {
    description: meta,
    duration: 8000,
  });
}

/** Map an ApiError to honest user-facing copy (ERR-std shape). */
export function toastApiError(err: unknown, fallback = "Something broke on our bench. It's been logged."): void {
  if (err instanceof ApiError) {
    const meta = err.details.length > 0 ? err.details.join(" · ") : err.code;
    toastErr(err.message, meta);
    return;
  }
  toastErr(fallback);
}

/** Friendly label for RATE_LIMITED countdowns (AT-003). */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const s = Math.max(1, Math.ceil(retryAfterSeconds));
  return `Too many attempts. Try again in ${s}s.`;
}
