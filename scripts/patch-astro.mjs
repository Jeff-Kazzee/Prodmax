/**
 * Postinstall patch for Astro (see scripts/with-subst.mjs for context).
 *
 * Astro's middleware virtual module embeds the resolved middleware path in
 * SINGLE quotes without escaping. On workspaces whose path contains an
 * apostrophe (…/Jeff's Agent Workshop/…), the generated import is invalid
 * JavaScript. This patch escapes backslashes and apostrophes in the embedded
 * path so any path round-trips.
 *
 * Normalizes any state of the line (original, mis-escaped by an older patch,
 * or already correct) and self-tests the generated code before writing.
 * Idempotent; exits 0 silently when Astro isn't installed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const target = path.resolve("node_modules/astro/dist/core/middleware/vite-plugin.js");
let src;
try {
  src = readFileSync(target, "utf8");
} catch {
  process.exit(0);
}

// Matches the whole embedded import regardless of quoting/escaping state:
// the fragment lives inside a template literal and contains no backticks.
const line = /import \{ onRequest as userOnRequest \} from [^`]+;/;
// Replacement as it must appear in vite-plugin.js (template-literal text +
// expression). Encoded here as a plain double-quoted string:
//   from '${resolvedMiddlewareId.replace(/['\\]/g, c => "\\" + c)}';
const replacement =
  "import { onRequest as userOnRequest } from '${resolvedMiddlewareId.replace(/['\\\\]/g, c => \"\\\\\" + c)}';";

// Self-test: build the template function the patched file will contain and
// generate an import for an apostrophe path; it must be escaped JS.
const generate = new Function("resolvedMiddlewareId", "return `" + replacement + "`;");
const sample = generate("C:/Users/jeffk/Jeff's Agent Workshop/p/src/middleware.ts");
if (!sample.includes("from 'C:/Users/jeffk/Jeff\\'s Agent Workshop/p/src/middleware.ts';")) {
  console.error("patch-astro: self-test failed, generated:", sample);
  process.exit(1);
}

const match = src.match(line);
if (!match) {
  // A future Astro version changed shape; the subst wrapper keeps builds
  // working in that case.
  console.log("patch-astro: middleware import not found — nothing to do");
  process.exit(0);
}
if (match[0] === replacement) {
  console.log("patch-astro: middleware import already escaped");
  process.exit(0);
}

writeFileSync(target, src.replace(line, replacement));
console.log("patch-astro: middleware import escaping applied (apostrophe-safe paths)");
