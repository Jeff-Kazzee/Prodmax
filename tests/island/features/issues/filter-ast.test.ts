import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTER,
  addChip,
  decodeF,
  encodeF,
  isEmptyFilter,
  removeChip,
  resolveFilter,
  updateChip,
} from "@island/features/issues/filter-ast";
import type { FilterLeaf } from "@/lib/validation/views";

const high: FilterLeaf = { field: "priority", op: "eq", value: 3 };

describe("filter AST ?f= round-trip", () => {
  it("encodes and decodes an AND group of chips", () => {
    const node = addChip(EMPTY_FILTER, high);
    const raw = encodeF(node);
    expect(JSON.parse(raw)).toEqual(node);
    expect(decodeF(raw)).toEqual(node);
    expect(decodeF(encodeURIComponent(raw))).toEqual(node);
  });

  it("treats missing/invalid f as empty", () => {
    expect(isEmptyFilter(decodeF(null))).toBe(true);
    expect(isEmptyFilter(decodeF("not-json"))).toBe(true);
  });

  it("supports chip CRUD", () => {
    let node = addChip(EMPTY_FILTER, high);
    node = addChip(node, { field: "assignee", op: "eq", value: "me" });
    expect(node.children).toHaveLength(2);
    node = updateChip(node, 0, { field: "priority", op: "eq", value: 4 });
    expect((node.children[0] as FilterLeaf).value).toBe(4);
    node = removeChip(node, 1);
    expect(node.children).toHaveLength(1);
    node = removeChip(node, 0);
    expect(isEmptyFilter(node)).toBe(true);
  });

  it("resolves assignee me to the current user id", () => {
    const node = addChip(EMPTY_FILTER, { field: "assignee", op: "eq", value: "me" });
    const resolved = resolveFilter(node, "user-9");
    expect(resolved).toEqual({
      combinator: "and",
      children: [{ field: "assignee", op: "eq", value: "user-9" }],
    });
  });
});
