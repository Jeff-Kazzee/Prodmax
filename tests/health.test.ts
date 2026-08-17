import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET } from "@/pages/api/health";

describe("GET /api/health", () => {
  it("returns the service health JSON", async () => {
    const response = await GET({} as unknown as APIContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "prodmax",
      version: "0.1.0",
    });
  });
});
