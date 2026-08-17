/**
 * Identifier schemes (architecture §2 conventions + §2.10):
 * - UUIDv7 primary keys (time-sortable, generated app-side).
 * - Team-key + counter allocation for issue identifiers (PRO-123).
 */
import { randomInt } from "node:crypto";
import type Database from "better-sqlite3";

export type SqliteDb = Database.Database;

/** Deterministic RNG for seeds/tests; returns floats in [0, 1). */
export type Rng = () => number;

function cryptoRng(): number {
  return randomInt(0, 2 ** 31) / 2 ** 31;
}

let _lastMs = -1;
let _seq = 0;

/**
 * UUIDv7: 48-bit Unix-millisecond timestamp, version 7, 12-bit per-ms
 * monotonic counter (rand_a), RFC variant, 62 random bits (rand_b).
 * Pass a seeded `rng` (e.g. mulberry32) for deterministic output in seeds.
 */
export function uuid7(rng: Rng = cryptoRng): string {
  const now = Date.now();
  _seq = now === _lastMs ? (_seq + 1) & 0xfff : 0;
  if (_seq === 0 && now === _lastMs) _seq = 1; // counter wrap within the same ms
  _lastMs = now;

  const b = new Uint8Array(16);
  b[0] = (now / 2 ** 40) & 0xff;
  b[1] = (now / 2 ** 32) & 0xff;
  b[2] = (now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;
  b[6] = 0x70 | ((_seq >> 8) & 0x0f); // version 7 + counter high bits
  b[7] = _seq & 0xff; // counter low bits
  for (let i = 9; i < 16; i++) b[i] = Math.floor(rng() * 256) & 0xff;
  b[8] = 0x80 | (Math.floor(rng() * 256) & 0x3f); // RFC 4122 variant

  const hex = Array.from(b, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Small deterministic PRNG (mulberry32) — use for reproducible seeds. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create the team_counters row if missing (idempotent). */
export function ensureTeamCounter(sqlite: SqliteDb, teamId: string): void {
  sqlite
    .prepare("INSERT OR IGNORE INTO team_counters (team_id, next_number) VALUES (?, 1)")
    .run(teamId);
}

/**
 * Allocate the next issue number for a team (§2.10). Single UPDATE …
 * RETURNING under better-sqlite3's synchronous driver is race-free in a
 * single process; call inside the same transaction as the issue INSERT.
 * Returns the allocated number (the counter is left pointing past it).
 */
export function allocateIssueNumber(sqlite: SqliteDb, teamId: string): number {
  const row = sqlite
    .prepare(
      "UPDATE team_counters SET next_number = next_number + 1 WHERE team_id = ? RETURNING next_number - 1 AS n",
    )
    .get(teamId) as { n: number } | undefined;
  if (row === undefined) {
    throw new Error(`team_counters row missing for team ${teamId} — call ensureTeamCounter first`);
  }
  return row.n;
}

/** Allocate a number and render the team-keyed identifier (`PRO-123`). */
export function allocateIssueIdentifier(
  sqlite: SqliteDb,
  teamId: string,
): { number: number; identifier: string } {
  const team = sqlite
    .prepare("SELECT key FROM teams WHERE id = ?")
    .get(teamId) as { key: string } | undefined;
  if (team === undefined) throw new Error(`team not found: ${teamId}`);
  const number = allocateIssueNumber(sqlite, teamId);
  return { number, identifier: `${team.key}-${number}` };
}
