/**
 * T-027. The gate runner's parsers, against real captured output.
 *
 * The fixtures are genuine bytes from GitHub Actions run 32313063496, the CI
 * job for PR 13, with the per-line log prefix removed and nothing else
 * changed. That run reported `PASS test counts unparsed` while really
 * executing 256 tests, which is the defect these tests exist to hold shut.
 *
 * Each gate has a pair: `-ci-ansi` as the runner captured it, and `-ci-plain`
 * with the escapes removed by an independent regex rather than by the code
 * under test. Both must parse to the same counts, and those counts are the
 * ones the CI verdict block printed for that run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UNPARSED, stripAnsi, summarize, tailLines } from "../../scripts/gates.mjs";

function fixture(name: string): string {
  // Resolved from the vitest root rather than import.meta.url, which the
  // transform rewrites to a bare drive root on Windows.
  return readFileSync(resolve("tests/scripts/fixtures", `${name}.txt`), "utf8");
}

/** The four gates as CI reported them, read off that run's verdict block. */
const EXPECTED: Record<string, string> = {
  build: "complete",
  check: "276 files, 0 errors",
  test: "files: 51 passed (51) | tests: 256 passed (256)",
  e2e: "9 passed (9.7s)",
};

describe("summarize against captured CI output", () => {
  for (const gate of ["build", "check", "test", "e2e"]) {
    it(`reads ${gate} counts through ANSI styling`, () => {
      expect(summarize(gate, fixture(`${gate}-ci-ansi`))).toBe(EXPECTED[gate]);
    });

    it(`reads ${gate} counts from plain output`, () => {
      expect(summarize(gate, fixture(`${gate}-ci-plain`))).toBe(EXPECTED[gate]);
    });

    it(`reads the same ${gate} counts either way`, () => {
      expect(summarize(gate, fixture(`${gate}-ci-ansi`))).toBe(
        summarize(gate, fixture(`${gate}-ci-plain`)),
      );
    });
  }

  it("carries real escape sequences in the styled fixtures", () => {
    // Without this, someone could "fix" a failing test by sanitising the
    // fixtures, and every assertion above would keep passing while proving
    // nothing about the case that broke CI.
    expect(fixture("test-ci-ansi")).toContain("[");
    expect(fixture("check-ci-ansi")).toContain("[");
    expect(fixture("build-ci-ansi")).toContain("[");
    expect(fixture("test-ci-plain")).not.toContain("[");
  });

  it("reports the marker when the output genuinely has no counts", () => {
    // A gate that stops printing counts must be visible, not silently blank.
    expect(summarize("test", "nothing useful here")).toBe(UNPARSED);
    expect(summarize("check", "nothing useful here")).toBe(UNPARSED);
    expect(summarize("e2e", "nothing useful here")).toBe(UNPARSED);
    expect(summarize("build", "nothing useful here")).toBe(UNPARSED);
  });

  it("does not mistake a failing vitest run for a passing one", () => {
    // Vitest prints the test count on the line above the file count, which is
    // how a reader scanning for a number finds the wrong one. The summary must
    // carry both so the mismatch is visible.
    const failing = " Test Files  1 failed | 44 passed (45)\n      Tests  205 passed (205)\n";
    expect(summarize("test", failing)).toBe(
      "files: 1 failed | 44 passed (45) | tests: 205 passed (205)",
    );
  });
});

describe("stripAnsi", () => {
  it("leaves plain text untouched", () => {
    expect(stripAnsi("Tests  256 passed (256)")).toBe("Tests  256 passed (256)");
  });

  it("removes the styling vitest wraps around every number", () => {
    expect(stripAnsi("[2m Test Files [22m [1m[32m51 passed[39m")).toBe(
      " Test Files  51 passed",
    );
  });

  it("removes OSC hyperlinks, which end in BEL rather than a letter", () => {
    expect(stripAnsi("see ]8;;file:///tmp/x.tsx.ts]8;; ok")).toBe(
      "see x.ts ok",
    );
  });
});

describe("tailLines", () => {
  it("returns the last lines with styling removed and blanks dropped", () => {
    const tail = tailLines("[2malpha[22m\n\n\nbeta\ngamma\n", 2);
    expect(tail).toEqual(["beta", "gamma"]);
  });
});
