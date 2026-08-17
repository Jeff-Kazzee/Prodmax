/**
 * Test helpers for shell tests: fetch mocking keyed by URL/method.
 */
import { vi, type Mock } from "vitest";

export interface MeResponse {
  user: { id: string; email: string; name: string; avatarSeed: string };
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    role: string;
    joinedAt: number;
  }>;
}

export const DEMO_ME: MeResponse = {
  user: { id: "u1", email: "demo@prodmax.dev", name: "Demo User", avatarSeed: "seed" },
  workspaces: [
    {
      id: "ws1",
      name: "Acme Bench",
      slug: "acme",
      timezone: "UTC",
      role: "owner",
      joinedAt: 0,
    },
  ],
};

export function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * Install a fetch mock. Routes: `${method} ${url}` → Response | object
 * (object = 200 JSON). Returns the mock for call assertions.
 */
export function mockFetch(routes: Record<string, Response | unknown>): Mock {
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const hit = routes[`${method} ${path}`];
    if (hit === undefined) {
      return Promise.resolve(jsonResponse(404, { error: { code: "NOT_FOUND", message: `no route ${method} ${path}` } }));
    }
    if (hit instanceof Response) return Promise.resolve(hit);
    return Promise.resolve(jsonResponse(200, hit));
  });
  vi.stubGlobal("fetch", impl);
  return impl;
}

/** jsdom lacks ResizeObserver; Radix floating layers need it. */
export function installResizeObserver(): void {
  if (typeof globalThis.ResizeObserver !== "undefined") return;
  class ResizeObserverStub implements Partial<ResizeObserver> {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
