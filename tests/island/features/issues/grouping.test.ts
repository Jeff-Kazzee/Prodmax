import { afterEach, describe, expect, it } from "vitest";
import {
  collapseStorageKey,
  groupIssues,
  loadCollapsed,
  persistCollapsed,
  propertyPatchForGroup,
  toggleCollapsed,
} from "@island/features/issues/grouping";
import { issueFixture } from "./helpers";
import type { LookupMaps } from "@island/features/issues/types";
import { STATE_PROG, STATE_TODO, TEAM } from "./helpers";

const lookup: LookupMaps = {
  states: { [STATE_TODO.id]: STATE_TODO, [STATE_PROG.id]: STATE_PROG },
  teams: { [TEAM.id]: TEAM },
  members: { u1: { userId: "u1", name: "Demo User" } },
  labels: {},
};

describe("grouping + collapse persistence", () => {
  it("groups by status and sums points", () => {
    const issues = [
      issueFixture({ id: "1", stateId: STATE_TODO.id, estimate: 2 }),
      issueFixture({ id: "2", identifier: "PRO-2", stateId: STATE_PROG.id, estimate: 5 }),
      issueFixture({ id: "3", identifier: "PRO-3", stateId: STATE_TODO.id, estimate: 1 }),
    ];
    const groups = groupIssues(issues, "status", lookup);
    expect(groups.map((g) => g.label)).toEqual(["Todo", "In Progress"]);
    expect(groups[0]?.issues).toHaveLength(2);
    expect(groups[0]?.points).toBe(3);
  });

  it("persists collapse per view key", () => {
    const key = "test-view";
    localStorage.removeItem(collapseStorageKey(key));
    persistCollapsed(key, toggleCollapsed({}, "st-todo"));
    expect(loadCollapsed(key)["st-todo"]).toBe(true);
    persistCollapsed(key, toggleCollapsed(loadCollapsed(key), "st-todo"));
    expect(loadCollapsed(key)["st-todo"]).toBe(false);
  });

  it("maps a status column drop to a stateId PATCH body", () => {
    expect(propertyPatchForGroup("status", "st-prog")).toEqual({ stateId: "st-prog" });
    expect(propertyPatchForGroup("priority", "4")).toEqual({ priority: 4 });
    expect(propertyPatchForGroup("none", "x")).toBeNull();
  });
});

afterEach(() => {
  localStorage.clear();
});
