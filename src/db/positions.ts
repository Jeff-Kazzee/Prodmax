/**
 * Fractional indexing (architecture §2.10).
 *
 * Keys are non-empty strings over the base-62 alphabet, ordered
 * lexicographically — which for SQLite BINARY collation means ASCII code
 * point order, so the alphabet is listed 0-9 A-Z a-z (not 0-9 a-z A-Z).
 *
 * - `generateKeyBetween(prev, next)` — midpoint insertion; null bounds
 *   mean "before everything" / "after everything".
 * - Keys are unique; concurrent inserts converge without coordination.
 * - Rebalancing: when any sibling key exceeds 24 chars, re-space all
 *   siblings onto evenly distributed 12-char keys (amortized O(n)).
 */

/** ASCII-sorted base-62 so lexicographic order == visual order. */
export const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Middle of the alphabet — fresh keys start here, leaving headroom both ways. */
const MID = ALPHABET[31];

/** Rebalance threshold and target key length (§2.10). */
export const REBALANCE_AT_LENGTH = 24;
export const REBALANCE_KEY_LENGTH = 12;

function idx(ch: string): number {
  const i = ALPHABET.indexOf(ch);
  if (i < 0) throw new Error(`invalid position key character: ${JSON.stringify(ch)}`);
  return i;
}

/** Assert a key is non-empty and only contains alphabet characters. */
export function isValidKey(key: string): boolean {
  return key.length > 0 && /^[0-9A-Za-z]+$/.test(key) && [...key].every((c) => ALPHABET.includes(c));
}

function assertKey(key: string, label: string): void {
  if (!isValidKey(key)) throw new Error(`invalid ${label} key: ${JSON.stringify(key)}`);
}

/**
 * Generate a key that sorts between `prev` and `next` (either may be null).
 * Throws if prev >= next or the pair admits no key between (e.g. "a" and
 * "a0") — generators built on this function never produce such pairs.
 */
export function generateKeyBetween(prev: string | null, next: string | null): string {
  if (prev !== null) assertKey(prev, "prev");
  if (next !== null) assertKey(next, "next");
  if (prev !== null && next !== null && prev >= next) {
    throw new Error(`prev must sort before next (prev=${JSON.stringify(prev)}, next=${JSON.stringify(next)})`);
  }
  if (prev === null) {
    if (next === null) return MID;
    return beforeKey(next);
  }
  if (next === null) return afterKey(prev);
  return betweenKeys(prev, next);
}

/** Smallest-gap key that sorts strictly before `key` (used for prepend). */
function beforeKey(key: string): string {
  const i = idx(key[0]);
  if (i >= 2) return ALPHABET[Math.floor(i / 2)];
  if (i === 1) return `0${MID}`;
  // key starts with '0': recurse into the suffix
  if (key.length === 1 || key.slice(1).split("").every((c) => c === "0")) {
    throw new Error(`no key sorts before ${JSON.stringify(key)}`);
  }
  return `0${beforeKey(key.slice(1))}`;
}

/** Key that sorts strictly after `key` (used for append at end). */
function afterKey(key: string): string {
  const last = idx(key[key.length - 1]);
  if (last < ALPHABET.length - 1) return key.slice(0, -1) + ALPHABET[last + 1];
  return key + MID;
}

function commonPrefixLength(a: string, b: string): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k += 1;
  return k;
}

/**
 * A suffix that sorts strictly before `suffix` (suffix non-empty).
 * Returns a middle-of-the-gap choice, not merely the smallest possible.
 */
function belowSuffix(suffix: string): string {
  const i = idx(suffix[0]);
  if (i >= 2) return ALPHABET[Math.floor(i / 2)];
  if (i === 1) return `0${MID}`;
  if (suffix.length === 1 || suffix.slice(1).split("").every((c) => c === "0")) {
    throw new Error(`no key sorts below suffix ${JSON.stringify(suffix)}`);
  }
  return `0${belowSuffix(suffix.slice(1))}`;
}

/** Midpoint of two keys with a < b (both non-null, both valid). */
function betweenKeys(a: string, b: string): string {
  const k = commonPrefixLength(a, b);
  if (k < a.length && k < b.length) {
    const ca = idx(a[k]);
    const cb = idx(b[k]);
    if (cb - ca >= 2) return a.slice(0, k) + ALPHABET[Math.floor((ca + cb) / 2)];
    // adjacent chars: extend `a` — sorts after a (prefix) and before b (char k)
    return a + MID;
  }
  // `a` is a proper prefix of `b`
  return a + belowSuffix(b.slice(k));
}

/** True when any sibling key exceeds the 24-char rebalance threshold. */
export function needsRebalance(keys: readonly string[]): boolean {
  return keys.some((k) => k.length > REBALANCE_AT_LENGTH);
}

/**
 * `count` evenly spaced keys of exactly REBALANCE_KEY_LENGTH chars,
 * spanning the full keyspace. Strictly increasing, unique.
 */
export function rebalanceKeys(count: number): string[] {
  if (count <= 0) return [];
  const space = 62n ** BigInt(REBALANCE_KEY_LENGTH); // 62^12
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    const value = (space * BigInt(i)) / BigInt(count + 1);
    keys.push(encodeBase62(value, REBALANCE_KEY_LENGTH));
  }
  return keys;
}

function encodeBase62(value: bigint, length: number): string {
  const chars: string[] = [];
  let v = value;
  for (let i = 0; i < length; i++) {
    chars.push(ALPHABET[Number(v % 62n)]);
    v /= 62n;
  }
  return chars.reverse().join("");
}

export interface InsertPositionResult {
  /** The position to assign the new sibling. */
  position: string;
  /**
   * When the naive midpoint would overflow the threshold, a full set of
   * `existing.length + 1` evenly spaced keys to reassign to all siblings
   * (in visual order) within one transaction; otherwise undefined.
   */
  rebalance?: string[];
}

/**
 * Compute the position for inserting a new sibling at `index` into an
 * ordered list of existing position keys, rebalancing when the midpoint
 * would exceed the threshold (§2.10).
 */
export function insertPosition(
  existing: readonly string[],
  index: number,
): InsertPositionResult {
  if (index < 0 || index > existing.length) {
    throw new Error(`index ${index} out of range for ${existing.length} siblings`);
  }
  const prev = index > 0 ? existing[index - 1] : null;
  const next = index < existing.length ? existing[index] : null;
  const position = generateKeyBetween(prev, next);
  if (position.length <= REBALANCE_AT_LENGTH) return { position };
  const rebalance = rebalanceKeys(existing.length + 1);
  return { position: rebalance[index], rebalance };
}
