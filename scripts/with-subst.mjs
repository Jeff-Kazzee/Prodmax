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

const existing = spawnSync("subst", [], { encoding: "utf8" }).stdout || "";
const letters = ["X", "Y", "Z", "V", "U", "T", "S", "R"].map((l) => `${l}:`);
const taken = (l) => existing.toUpperCase().includes(l);
const reuses = letters.find((l) => taken(l) && existing.toUpperCase().includes(`${l}\\\\: => ${mapDir.toUpperCase()}`) === false);
let drive = null;
for (const l of letters) {
  if (!taken(l)) {
    const mapped = spawnSync("subst", [l, mapDir], { encoding: "utf8" });
    if (mapped.status === 0) {
      drive = l;
      break;
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
  spawnSync("subst", [drive, "/D"]);
}
process.exit(code);
