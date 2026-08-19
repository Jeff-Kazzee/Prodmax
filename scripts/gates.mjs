/**
 * The four gates, run so they cannot lie.
 *
 * Every gate failure this project has shipped was reported as green by someone
 * who ran `npm test 2>&1 | tail -5`. A shell pipeline exits with the status of
 * its LAST command, so `tail` returns 0 no matter what vitest did. The counts
 * still look clean, because vitest prints "Tests 176 passed" on the line above
 * "Test Files 1 failed" and a reader scanning for a number finds the wrong one.
 *
 * This runner keeps every exit code, prints one verdict block, and exits
 * non-zero if any gate failed. Paste its last block verbatim. Do not summarize
 * it, and do not pipe it anywhere that discards the exit code.
 *
 *   node scripts/gates.mjs           all four
 *   node scripts/gates.mjs --fast    check and test only, no build, no e2e
 *
 * Two rules govern the numbers (T-027):
 *
 * PASS and FAIL come from the exit code and never from the parsed counts. A
 * parser that cannot read a line must never be able to invent a verdict.
 *
 * Counts are stripped of ANSI before parsing. Without a TTY the tools still
 * emit colour, so the captured bytes read `[2m Test Files [22m...`
 * and every pattern below missed. That is how CI printed `counts unparsed` for
 * a run that really did execute 205 tests.
 */
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The marker a gate reports when its evidence could not be read. */
export const UNPARSED = "counts unparsed";

/**
 * Remove ANSI escape sequences.
 *
 * Covers CSI (colour, cursor moves) and the OSC hyperlinks vitest emits for
 * file paths, which carry a BEL or ST terminator rather than a letter.
 */
export function stripAnsi(text) {
  return String(text)
    .replace(/\]8;;.*?(?:|\\)/g, "")
    .replace(/\[[0-9;?]*[ -/]*[@-~]/g, "");
}

/**
 * Pull the numbers a human would want, without ever inferring pass from them.
 * Exported for tests: the parsers are the part that broke, so they are the
 * part with fixtures.
 */
export function summarize(name, rawOut) {
  const out = stripAnsi(rawOut);
  if (name === "check") {
    const m = out.match(/Result \((\d+) files\):\s*\n\s*-\s*(\d+) errors/);
    return m ? `${m[1]} files, ${m[2]} errors` : UNPARSED;
  }
  if (name === "test") {
    const files = out.match(/Test Files\s+(.+)/)?.[1]?.trim();
    const tests = out.match(/\n\s+Tests\s+(.+)/)?.[1]?.trim();
    return files && tests ? `files: ${files} | tests: ${tests}` : UNPARSED;
  }
  if (name === "e2e") {
    return out.match(/(\d+ passed.*)$/m)?.[1] ?? UNPARSED;
  }
  return out.includes("Complete!") ? "complete" : UNPARSED;
}

/** The last `n` non-empty lines, for showing what a parser could not read. */
export function tailLines(rawOut, n = 20) {
  return stripAnsi(rawOut)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-n);
}

const FAST = process.argv.includes("--fast");

/** e2e needs a fresh dist, and building first also keeps the repro off the jsdom workers. */
const GATES = [
  { name: "build", cmd: ["run", "build"], skip: FAST },
  { name: "check", cmd: ["run", "check"] },
  { name: "test", cmd: ["test"] },
  { name: "e2e", cmd: ["run", "e2e"], skip: FAST },
];

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function runGates() {
  const results = [];
  for (const gate of GATES) {
    if (gate.skip) {
      results.push({ name: gate.name, status: "SKIP", detail: "--fast", raw: "" });
      continue;
    }
    process.stdout.write(`\n──── ${gate.name} ────\n`);
    const run = spawnSync(npm, gate.cmd, { encoding: "utf8", shell: process.platform === "win32" });
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    process.stdout.write(out);
    results.push({
      name: gate.name,
      status: run.status === 0 ? "PASS" : "FAIL",
      detail: run.status === 0 ? summarize(gate.name, out) : `exit ${run.status}`,
      raw: out,
    });
  }

  const failed = results.filter((r) => r.status === "FAIL");
  const blind = results.filter((r) => r.status === "PASS" && r.detail === UNPARSED);

  process.stdout.write("\n════ GATE VERDICT ════\n");
  for (const r of results) {
    process.stdout.write(`${r.status.padEnd(4)} ${r.name.padEnd(6)} ${r.detail}\n`);
  }
  process.stdout.write(
    failed.length === 0
      ? "ALL GATES PASS\n"
      : `GATES FAILED: ${failed.map((r) => r.name).join(", ")}\n`,
  );

  /**
   * A green run that cannot show its numbers has not finished its job.
   *
   * This runner exists to produce evidence, and `counts unparsed` sitting
   * quietly beside a PASS reads as a formatting quirk rather than the alarm it
   * is: the same line would appear if a gate stopped reporting counts
   * altogether. So it exits non-zero, and with its own code, because "the
   * tests failed" and "I could not read the numbers" are different problems
   * and a reader must not have to guess which one turned the check red.
   */
  if (failed.length > 0) return 1;
  if (blind.length > 0) {
    process.stdout.write(
      `\n════ EVIDENCE MISSING ════\n` +
        `${blind.map((r) => r.name).join(", ")} passed but could not report counts.\n` +
        `PASS above is still correct: it comes from the exit code, never from these numbers.\n` +
        `Last lines of the output the parser could not read:\n`,
    );
    for (const r of blind) {
      process.stdout.write(`\n──── ${r.name} tail ────\n`);
      for (const line of tailLines(r.raw)) process.stdout.write(`${line}\n`);
    }
    return 2;
  }
  return 0;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) process.exit(runGates());
