import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  clearSelection,
  isSelected,
  pruneSelection,
  selectAll,
  selectRange,
  toggleId,
} from "@island/features/issues/selection";

const ids = ["a", "b", "c", "d"];

describe("selection semantics", () => {
  it("toggles and tracks an anchor", () => {
    const next = toggleId(EMPTY_SELECTION, "b");
    expect(next.ids).toEqual(["b"]);
    expect(next.anchorId).toBe("b");
    expect(isSelected(next, "b")).toBe(true);
    expect(toggleId(next, "b").ids).toEqual([]);
  });

  it("shift-range selects from the anchor inclusively", () => {
    const anchored = toggleId(EMPTY_SELECTION, "b");
    const ranged = selectRange(anchored, ids, "d");
    expect(ranged.ids).toEqual(["b", "c", "d"]);
    expect(ranged.anchorId).toBe("b");
  });

  it("select-all covers loaded ids; clear empties; prune drops missing", () => {
    const all = selectAll(ids);
    expect(all.ids).toEqual(ids);
    expect(clearSelection().ids).toEqual([]);
    const pruned = pruneSelection(all, new Set(["b", "c"]));
    expect(pruned.ids).toEqual(["b", "c"]);
  });
});
