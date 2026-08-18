import { describe, expect, it } from "vitest";
import { shouldFetchNext, virtualWindow } from "@island/features/issues/virtualize";

describe("virtualization window math", () => {
  it("windows 500 rows with overscan", () => {
    const win = virtualWindow({
      scrollTop: 3600,
      viewportHeight: 720,
      rowHeight: 36,
      count: 500,
      overscan: 8,
    });
    expect(win.totalHeight).toBe(18_000);
    expect(win.start).toBe(Math.max(0, 100 - 8));
    expect(win.end).toBeLessThanOrEqual(500);
    expect(win.visibleCount).toBeGreaterThan(20);
    expect(win.offsetY).toBe(win.start * 36);
  });

  it("clamps an empty list", () => {
    const win = virtualWindow({
      scrollTop: 0,
      viewportHeight: 400,
      rowHeight: 36,
      count: 0,
    });
    expect(win).toMatchObject({ start: 0, end: 0, totalHeight: 0, visibleCount: 0 });
  });

  it("asks for the next page near the sentinel", () => {
    expect(
      shouldFetchNext({
        scrollTop: 1700,
        viewportHeight: 400,
        totalHeight: 2000,
        hasNext: true,
        thresholdPx: 240,
      }),
    ).toBe(true);
    expect(
      shouldFetchNext({
        scrollTop: 0,
        viewportHeight: 400,
        totalHeight: 2000,
        hasNext: true,
      }),
    ).toBe(false);
    expect(
      shouldFetchNext({
        scrollTop: 1800,
        viewportHeight: 400,
        totalHeight: 2000,
        hasNext: false,
      }),
    ).toBe(false);
  });
});
