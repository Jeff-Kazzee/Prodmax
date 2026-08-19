/**
 * The pure cycle rules, asserted without a render so a failure points at the
 * arithmetic rather than at the DOM.
 */
import { describe, expect, it } from "vitest";
import {
  asOfCaption,
  burnUpSeries,
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

  it("counts mid-cycle days where the clamp cannot cover an off-by-one", () => {
    // The day-1 case above passes with or without the `+ 1`, because
    // Math.max(1, …) rescues the zero. Only a day the clamp does not touch
    // separates the two: 1.5 days in is day 2, and day 1 without the `+ 1`.
    expect(dayXofY(cycle, cycle.startsAt + 1.5 * 86_400_000).day).toBe(2);
    expect(dayXofY(cycle, cycle.startsAt + 6 * 86_400_000).day).toBe(7);
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
      // The 900-point outlier is FIRST in the array and oldest by closedAt.
      // Taking the first three without sorting would include it and read 310,
      // so this ordering is what makes the recency sort testable.
      closed(4, 900, 0),
      closed(1, 10, 1),
      closed(2, 20, 2),
      closed(3, 30, 3),
      cycleFixture({ id: "c9", status: "active" }),
    ];
    expect(capacityEstimate(cycles)).toEqual({ points: 20, sample: 3 });
  });

  it("returns null when nothing has closed, rather than guessing zero", () => {
    expect(capacityEstimate([cycleFixture()])).toBeNull();
  });

  it("reports the real sample size so the label cannot overstate it", () => {
    const one = cycleFixture({
      id: "c1",
      status: "completed",
      closedAt: 5,
      stats: { scope: { issues: 0, points: 0 }, completed: { issues: 0, points: 8 } },
    });
    // "mean of last 3" over a single closed cycle is a claim the data does
    // not support, so the caller is handed the count it must print.
    expect(capacityEstimate([one])).toEqual({ points: 8, sample: 1 });
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

  it("stamps the close time, not the scheduled end", () => {
    // A cycle ended early through the surgery menu closes before endsAt, so
    // asserting only the "as of close" prefix would let the wrong timestamp
    // through. closedAt here is a day before endsAt.
    const ended = cycleFixture({
      status: "completed",
      startsAt: Date.UTC(2026, 0, 1),
      endsAt: Date.UTC(2026, 0, 15),
      closedAt: Date.UTC(2026, 0, 14, 9, 30),
    });
    expect(asOfCaption(ended)).toBe("as of close 2026-01-14 09:30");
  });
});

describe("burnUpSeries", () => {
  const cycle = cycleFixture({
    startsAt: Date.UTC(2026, 0, 1),
    endsAt: Date.UTC(2026, 0, 15),
    stats: { scope: { issues: 6, points: 12 }, completed: { issues: 2, points: 4 } },
  });
  const day = (n: number) => cycle.startsAt + n * 86_400_000;

  it("takes scope from the server, not from the rows on screen", () => {
    // The rows sum to 12 including the canceled one and 10 without it, while
    // the server says 12 for its own reasons. Summing rows would agree with
    // neither the header nor a paged cycle.
    const { scope } = burnUpSeries(cycle, scopedIssues(), LOOKUP, day(3));
    expect(scope).toBe(cycle.stats.scope.points);
  });

  it("ignores the rows entirely when computing scope", () => {
    const { scope } = burnUpSeries(cycle, [], LOOKUP, day(3));
    expect(scope).toBe(12);
  });

  it("buckets a completion into its day and accumulates forward", () => {
    const issues = [
      { ...scopedIssues()[3]!, estimate: 2, completedAt: day(2) },
      { ...scopedIssues()[4]!, estimate: 3, completedAt: day(5) },
    ];
    const { points } = burnUpSeries(cycle, issues, LOOKUP, day(9));
    expect(points[1]?.completed).toBe(0);
    expect(points[2]?.completed).toBe(2);
    expect(points[4]?.completed).toBe(2);
    expect(points[5]?.completed).toBe(5);
  });

  it("clamps a completion from before the cycle into day 0 rather than a negative index", () => {
    const early = [{ ...scopedIssues()[3]!, estimate: 4, completedAt: day(-9) }];
    const { points } = burnUpSeries(cycle, early, LOOKUP, day(3));
    expect(points[0]?.completed).toBe(4);
  });

  it("stops the completed line at today instead of flat-lining into the future", () => {
    const { points } = burnUpSeries(cycle, scopedIssues(), LOOKUP, day(4));
    expect(Number.isFinite(points[4]?.completed ?? Number.NaN)).toBe(true);
    // A finite value past today would read as a promise that nothing more
    // lands for the rest of the cycle.
    expect(Number.isNaN(points[9]?.completed ?? 0)).toBe(true);
  });

  it("spans one point per day inclusive of both ends", () => {
    const { points } = burnUpSeries(cycle, [], LOOKUP, day(3));
    expect(points).toHaveLength(15);
    expect(points.at(-1)?.ideal).toBe(12);
  });
});
