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
 */
import { spawnSync } from "node:child_process";

const FAST = process.argv.includes("--fast");

/** e2e needs a fresh dist, and building first also keeps the repro off the jsdom workers. */
const GATES = [
  { name: "build", cmd: ["run", "build"], skip: FAST },
  { name: "check", cmd: ["run", "check"] },
  { name: "test", cmd: ["test"] },
  { name: "e2e", cmd: ["run", "e2e"], skip: FAST },
];

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/** Pull the numbers a human would want, without ever inferring pass from them. */
function summarize(name, out) {
  if (name === "check") {
    const m = out.match(/Result \((\d+) files\):\s*\n\s*-\s*(\d+) errors/);
    return m ? `${m[1]} files, ${m[2]} errors` : "counts unparsed";
  }
  if (name === "test") {
    const files = out.match(/Test Files\s+(.+)/)?.[1]?.trim();
    const tests = out.match(/\n\s+Tests\s+(.+)/)?.[1]?.trim();
    return files && tests ? `files: ${files} | tests: ${tests}` : "counts unparsed";
  }
  if (name === "e2e") {
    return out.match(/(\d+ passed.*)$/m)?.[1] ?? "counts unparsed";
  }
  return out.includes("Complete!") ? "complete" : "counts unparsed";
}

const results = [];
for (const gate of GATES) {
  if (gate.skip) {
    results.push({ name: gate.name, status: "SKIP", detail: "--fast" });
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
  });
}

const failed = results.filter((r) => r.status === "FAIL");

process.stdout.write("\n════ GATE VERDICT ════\n");
for (const r of results) {
  process.stdout.write(`${r.status.padEnd(4)} ${r.name.padEnd(6)} ${r.detail}\n`);
}
process.stdout.write(
  failed.length === 0
    ? "ALL GATES PASS\n"
    : `GATES FAILED: ${failed.map((r) => r.name).join(", ")}\n`,
);

process.exit(failed.length === 0 ? 0 : 1);
