/**
 * The pure cycle rules, asserted without a render so a failure points at the
 * arithmetic rather than at the DOM.
 */
import { describe, expect, it } from "vitest";
import {
  asOfCaption,
  capacityEstimate,
  dayXofY,
  pickCurrent,
  rolloverSet,
  rolloverTarget,
} from "@island/features/cycles/cycle-stats";
import type { LookupMaps, StateOption } from "@island/features/issues/types";
import { cycleFixture, scopedIssues } from "./helpers";
import { STATE_CANCELLED, STATE_DONE } from "../projects/helpers";
import { STATE_PROG, STATE_TODO } from "../issues/helpers";

function lookupOf(states: StateOption[]): LookupMaps {
  const maps: LookupMaps = { states: {}, teams: {}, members: {}, labels: {} };
  for (const s of states) maps.states[s.id] = s;
  return maps;
}

const LOOKUP = lookupOf([STATE_TODO, STATE_PROG, STATE_DONE, STATE_CANCELLED] as StateOption[]);

describe("rolloverSet", () => {
  it("keeps exactly the categories the server rolls", () => {
    // 3 open, 2 completed, 1 canceled. This is the whole rule.
    const rolling = rolloverSet(scopedIssues(), LOOKUP);
    expect(rolling.map((i) => i.identifier)).toEqual(["PRO-1", "PRO-2", "PRO-3"]);
  });

  it("counts an issue whose state is missing from the lookup", () => {
    // The server has no such gap, so under-reporting here would promise a
    // smaller rollover than the one about to happen.
    const [first] = scopedIssues();
    const orphan = { ...first!, id: "issX", identifier: "PRO-X", stateId: "st-unknown" };
    expect(rolloverSet([orphan], LOOKUP).map((i) => i.identifier)).toEqual(["PRO-X"]);
  });
});

describe("dayXofY", () => {
  const cycle = cycleFixture();

  it("reports day 1 on the first day, not day 0", () => {
    expect(dayXofY(cycle, cycle.startsAt)).toEqual({ day: 1, total: 14 });
  });

  it("clamps a read before the start and after the end", () => {
    expect(dayXofY(cycle, cycle.startsAt - 5 * 86_400_000).day).toBe(1);
    expect(dayXofY(cycle, cycle.endsAt + 99 * 86_400_000).day).toBe(14);
  });
});

describe("capacityEstimate", () => {
  it("means the last three closed cycles and ignores running ones", () => {
    const closed = (n: number, points: number, closedAt: number) =>
      cycleFixture({
        id: `c${n}`,
        number: n,
        status: "completed",
        closedAt,
        stats: { scope: { issues: 0, points: 0 }, completed: { issues: 0, points } },
      });
    const cycles = [
      closed(1, 10, 1),
      closed(2, 20, 2),
      closed(3, 30, 3),
      // A fourth, older close must fall outside the window, and the running
      // cycle must not count at all.
      closed(4, 900, 0),
      cycleFixture({ id: "c9", status: "active" }),
    ];
    expect(capacityEstimate(cycles)).toBe(20);
  });

  it("returns null when nothing has closed, rather than guessing zero", () => {
    expect(capacityEstimate([cycleFixture()])).toBeNull();
  });
});

describe("pickCurrent", () => {
  it("prefers an active cycle over an upcoming one", () => {
    const future = cycleFixture({ id: "cF", status: "future", startsAt: 1 });
    const active = cycleFixture({ id: "cA", status: "active", startsAt: 2 });
    expect(pickCurrent([future, active])?.id).toBe("cA");
  });

  it("falls back to the soonest upcoming cycle", () => {
    const late = cycleFixture({ id: "cL", status: "future", startsAt: 90 });
    const soon = cycleFixture({ id: "cS", status: "future", startsAt: 10 });
    expect(pickCurrent([late, soon])?.id).toBe("cS");
  });

  it("returns null when only completed cycles exist", () => {
    expect(pickCurrent([cycleFixture({ status: "completed" })])).toBeNull();
  });
});

describe("rolloverTarget", () => {
  const current = cycleFixture();

  it("picks the earliest non-completed cycle starting at or after this one ends", () => {
    const later = cycleFixture({ id: "c4", number: 4, status: "future", startsAt: current.endsAt + 100 });
    const next = cycleFixture({ id: "c3", number: 3, status: "future", startsAt: current.endsAt });
    expect(rolloverTarget(current, [current, later, next])?.id).toBe("c3");
  });

  it("ignores a cycle that starts before this one ends", () => {
    const overlapping = cycleFixture({ id: "c3", status: "future", startsAt: current.endsAt - 1 });
    expect(rolloverTarget(current, [current, overlapping])).toBeNull();
  });

  it("ignores a completed cycle even when its dates fit", () => {
    const done = cycleFixture({ id: "c3", status: "completed", startsAt: current.endsAt });
    expect(rolloverTarget(current, [current, done])).toBeNull();
  });
});

describe("asOfCaption", () => {
  it("captions a completed cycle and stays silent on a running one", () => {
    expect(asOfCaption(cycleFixture({ status: "completed", closedAt: 1_700_500_000_000 }))).toContain(
      "as of close",
    );
    expect(asOfCaption(cycleFixture())).toBeNull();
  });
});
