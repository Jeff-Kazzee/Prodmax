/**
 * Viewport awareness for shell breakpoints (§3.6): mobile <768,
 * tablet 768–1023, desktop ≥1024. SSR-safe (island is client-only).
 */
import { useEffect, useState } from "react";

export type Viewport = "mobile" | "tablet" | "desktop";

function current(): Viewport {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(current);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setVp(current()));
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return vp;
}
