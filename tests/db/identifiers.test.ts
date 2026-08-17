// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  allocateIssueIdentifier,
  ensureTeamCounter,
} from "@/db/ids";
import { cleanupTestDbs, createFixtures, createTestDb } from "./helpers";

afterEach(cleanupTestDbs);

describe("issue identifier allocation (§2.10)", () => {
  it("allocates sequential numbers rendered with the team key", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    ensureTeamCounter(sqlite, fx.teamId);

    expect(allocateIssueIdentifier(sqlite, fx.teamId)).toEqual({ number: 1, identifier: "PRO-1" });
    expect(allocateIssueIdentifier(sqlite, fx.teamId)).toEqual({ number: 2, identifier: "PRO-2" });
    expect(allocateIssueIdentifier(sqlite, fx.teamId)).toEqual({ number: 3, identifier: "PRO-3" });
    expect(counter(sqlite, fx.teamId)).toBe(4);
  });

  it("a 50-allocation burst is unique and strictly ordered", () => {
    const { sqlite } = createTestDb();
    const fx = createFixtures(sqlite);
    ensureTeamCounter(sqlite, fx.teamId);

    const burst = sqlite.transaction(() =>
      Array.from({ length: 50 }, () => allocateIssueIdentifier(sqlite, fx.teamId)),
    );
    const allocations = burst();

    const identifiers = allocations.map((a) => a.identifier);
    expect(new Set(identifiers).size).toBe(50);
    expect(identifiers[0]).toBe("PRO-1");
    expect(identifiers[49]).toBe("PRO-50");
    expect(allocations.map((a) => a.number)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    expect(counter(sqlite, fx.teamId)).toBe(51);
  });

  it("throws when the team_counters row is missing", () => {
    const { sqlite } = createTestDb();
    createFixtures(sqlite); // no ensureTeamCounter call
    expect(() => allocateIssueIdentifier(sqlite, "team-1")).toThrow(/team_counters/);
  });
});

function counter(sqlite: Parameters<typeof createFixtures>[0], teamId: string): number {
  return (
    sqlite.prepare("SELECT next_number AS n FROM team_counters WHERE team_id = ?").get(teamId) as {
      n: number;
    }
  ).n;
}
