// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  REBALANCE_KEY_LENGTH,
  REBALANCE_AT_LENGTH,
  generateKeyBetween,
  insertPosition,
  isValidKey,
  rebalanceKeys,
} from "@/db/positions";
import { cleanupTestDbs, createTestDb } from "./helpers";

afterEach(cleanupTestDbs);

describe("fractional indexing (§2.10)", () => {
  it("midpoint keys sort strictly between their neighbors", () => {
    expect(generateKeyBetween(null, null)).toBe("V"); // ALPHABET[31], middle
    expect(generateKeyBetween("a", "c")).toBe("b");
    expect(generateKeyBetween("a", "b")).toBe("aV"); // adjacent: extend with mid
    expect(generateKeyBetween(null, "b")).toBe("I"); // floor(idx('b')/2)
    const before = generateKeyBetween(null, "a");
    expect(before < "a").toBe(true);
    const after = generateKeyBetween("z", null);
    expect(after > "z").toBe(true);
    for (const k of ["a", "af", "V", "0V", "ZZ"]) expect(isValidKey(k)).toBe(true);
  });

  it("rebalances once midpoint keys exceed the threshold (never 255+ chars)", () => {
    const keys = ["a", "b"];
    let rebalanced = false;
    // Stress far beyond what could produce a 255-char key if unbounded.
    for (let i = 0; i < 500 && !rebalanced; i++) {
      const result = insertPosition(keys, 1);
      if (result.rebalance === undefined) {
        keys.splice(1, 0, result.position);
        expect(result.position.length).toBeLessThanOrEqual(REBALANCE_AT_LENGTH);
      } else {
        rebalanced = true;
        keys.length = 0;
        keys.push(...result.rebalance);
      }
      // Keys stay valid, unique and ordered the whole time.
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort().join("\u0000")).toBe(keys.join("\u0000"));
    }

    expect(rebalanced).toBe(true);
    // The rebalance contract: evenly spaced 12-char keys, strictly increasing.
    expect(keys.every((k) => k.length === REBALANCE_KEY_LENGTH)).toBe(true);
    expect(keys.join("\u0000")).toBe([...keys].sort().join("\u0000"));
    expect(keys.every((k) => k.length < 255)).toBe(true);
  });

  it("rebalanceKeys produces unique evenly spaced keys for any count", () => {
    expect(rebalanceKeys(0)).toEqual([]);
    for (const n of [1, 2, 7, 24]) {
      const keys = rebalanceKeys(n);
      expect(keys).toHaveLength(n);
      expect(new Set(keys).size).toBe(n);
      expect(keys.join("\u0000")).toBe([...keys].sort().join("\u0000"));
    }
  });

  it("insertPosition rejects out-of-range indices", () => {
    const { sqlite } = createTestDb(); // exercises migrations alongside positions
    expect(sqlite.prepare("SELECT 1 AS ok").get()).toEqual({ ok: 1 });
    expect(() => insertPosition(["a"], 2)).toThrow(/out of range/);
    expect(() => insertPosition(["a"], -1)).toThrow(/out of range/);
  });
});
