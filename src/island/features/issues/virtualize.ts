/**
 * Window math for list/table virtualization (architecture §9).
 * No external windowing dependency — overscan keeps 16ms/frame at ≥500 rows.
 */

export interface VirtualWindowInput {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  count: number;
  overscan?: number;
}

export interface VirtualWindow {
  start: number;
  end: number;
  offsetY: number;
  totalHeight: number;
  visibleCount: number;
}

export function virtualWindow(input: VirtualWindowInput): VirtualWindow {
  const rowHeight = Math.max(1, input.rowHeight);
  const count = Math.max(0, Math.trunc(input.count));
  const overscan = input.overscan ?? 8;
  const viewportHeight = Math.max(0, input.viewportHeight);
  const scrollTop = Math.max(0, input.scrollTop);
  const totalHeight = count * rowHeight;
  if (count === 0) {
    return { start: 0, end: 0, offsetY: 0, totalHeight: 0, visibleCount: 0 };
  }
  const rawStart = Math.floor(scrollTop / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight) + 1;
  const start = Math.max(0, rawStart - overscan);
  const end = Math.min(count, rawStart + visible + overscan);
  return {
    start,
    end,
    offsetY: start * rowHeight,
    totalHeight,
    visibleCount: Math.max(0, end - start),
  };
}

/** True when the sentinel (near list end) should fetch the next cursor page. */
export function shouldFetchNext(input: {
  scrollTop: number;
  viewportHeight: number;
  totalHeight: number;
  hasNext: boolean;
  thresholdPx?: number;
}): boolean {
  if (!input.hasNext) return false;
  const threshold = input.thresholdPx ?? 240;
  return input.scrollTop + input.viewportHeight >= input.totalHeight - threshold;
}
