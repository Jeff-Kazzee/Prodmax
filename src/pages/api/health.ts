import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = () => {
  return Response.json({ ok: true, service: "prodmax", version: "0.1.0" });
};
