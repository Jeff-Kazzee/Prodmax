/**
 * Runs a command from an apostrophe-free path via Windows `subst`.
 *
 * Why: Astro's build codegen wraps file paths in single quotes
 * (astro-internal:middleware); a workspace path containing `'`
 * (…/Jeff's Agent Workshop/…) produces invalid JS. Mapping the
 * apostrophe-bearing directory to a drive letter sidesteps it. On
 * non-Windows or apostrophe-free paths this is a plain passthrough.
 */
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node scripts/with-subst.mjs <command> [args…]");
  process.exit(2);
}

const cwd = process.cwd();
const isWindows = process.platform === "win32";
const needsSubst = isWindows && cwd.includes("'");

function run(command, args, dir) {
  const res = spawnSync(command, args, { stdio: "inherit", shell: isWindows, cwd: dir });
  return res.status ?? 1;
}

if (!needsSubst) {
  process.exit(run(argv[0], argv.slice(1), cwd));
}

// Map the FULL directory component containing the LAST apostrophe
// (…/jeffk/Jeff's Agent Workshop) onto a drive letter; the project
// becomes <L>:/<rest…> with no apostrophe anywhere.
const normalized = cwd.replace(/\//g, "\\");
const lastApos = normalized.lastIndexOf("'");
const componentEnd = normalized.indexOf("\\", lastApos);
const mapDir = componentEnd === -1 ? normalized : normalized.slice(0, componentEnd);
const rest = normalized.slice(mapDir.length).replace(/^\\+/, "");

// Parse `subst` output ("Y:\: => C:\some\dir") into letter → dir.
const existingOut = spawnSync("subst", [], { encoding: "utf8" }).stdout || "";
const mappings = new Map();
for (const line of existingOut.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z]:)\\: => (.+)$/);
  if (m) mappings.set(m[1].toUpperCase(), m[2]);
}
const wanted = mapDir.replace(/\\+$/, "").toUpperCase();
// Reuse a mapping that already points where we need it — a leftover from a
// hard-killed run keeps the SAME letter, so root-keyed caches (.astro,
// node_modules/.vite) stay valid. Only unmap a letter we created below.
const reused = [...mappings.entries()].find(([, dir]) => dir.replace(/\\+$/, "").toUpperCase() === wanted);
let drive = reused?.[0] ?? null;
let created = false;
if (!drive) {
  const letters = ["X", "Y", "Z", "V", "U", "T", "S", "R"].map((l) => `${l}:`);
  for (const l of letters) {
    if (!mappings.has(l)) {
      const mapped = spawnSync("subst", [l, mapDir], { encoding: "utf8" });
      if (mapped.status === 0) {
        drive = l;
        created = true;
        break;
      }
    }
  }
}
if (!drive) {
  console.error(`with-subst: could not map "${mapDir}" to a free drive letter`);
  process.exit(1);
}

const projectDir = `${drive}\\${rest}`;
let code = 1;
try {
  code = run(argv[0], argv.slice(1), projectDir);
} finally {
  if (created) spawnSync("subst", [drive, "/D"]);
}
process.exit(code);
