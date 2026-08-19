/**
 * The ordering repro (T-005 remediation phase 4).
 *
 * Four constraints are load-bearing and none of them can be relaxed.
 * The fixture is seeded straight into SQLite, so no M4 module is loaded into
 * the server process. The server is a fresh child on its own port, because the
 * old registration was process-wide and permanent. The completion goes over
 * HTTP through /api/issues/:id with no projects route served first. The result
 * is read out of the database file rather than through the projects API, which
 * would import the projects service and change the process under test.
 */
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ENTRY = path.join(ROOT, "dist", "server", "entry.mjs");

let child: ChildProcess | undefined;
let workdir: string | undefined;

/**
 * Windows keeps the SQLite WAL and SHM handles open until the child has really
 * exited, so killing and reading in the same tick fails with a disk I/O error
 * and deleting the workdir fails with EPERM. Wait for the exit event.
 */
async function stopServer(): Promise<void> {
  const running = child;
  child = undefined;
  if (!running || running.exitCode !== null || running.pid === undefined) return;
  await new Promise<void>((resolve) => {
    running.once("exit", () => resolve());
    running.kill();
    setTimeout(resolve, 10_000).unref();
  });
}

afterAll(async () => {
  await stopServer();
  if (!workdir) return;
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    /* a leaked temp dir beats a failing gate */
  }
});

/** Newest mtime under a directory tree. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    newest = Math.max(newest, stat.isDirectory() ? newestMtime(full) : stat.mtimeMs);
  }
  return newest;
}

/**
 * The process under test is the built server, so a dist older than src would
 * silently test the previous tree. `npm test` runs before `npm run build` in
 * the gate order, so this rebuilds rather than trusting whatever is on disk.
 */
function ensureFreshBuild(): void {
  if (existsSync(ENTRY) && statSync(ENTRY).mtimeMs >= newestMtime(path.join(ROOT, "src"))) return;
  const built = spawnSync(process.execPath, [path.join(ROOT, "scripts", "with-subst.mjs"), "astro", "build"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  if (built.status !== 0) throw new Error("astro build failed while preparing the ordering repro");
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

interface Fixture {
  wsId: string;
  issueId: string;
  projectId: string;
  doneStateId: string;
  token: string;
}

/** Seed directly in SQLite. Nothing here loads an M4 module into the server. */
function seed(dbFile: string): Fixture {
  const sqlite = new Database(dbFile);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: path.join(ROOT, "src", "db", "migrations") });
  sqlite.exec(readFileSync(path.join(ROOT, "src", "db", "fts.sql"), "utf8"));

  const now = Date.now();
  const token = randomBytes(32).toString("hex");
  const ids = {
    user: "u-repro",
    ws: "ws-repro",
    team: "tm-repro",
    todo: "st-repro-todo",
    done: "st-repro-done",
    project: "pj-repro",
    issue: "is-repro",
  };
  const run = (sql: string, ...params: unknown[]): void => {
    sqlite.prepare(sql).run(...params);
  };

  run(
    "INSERT INTO users (id, email, password_hash, name, avatar_seed, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    ids.user, "repro@prodmax.dev", "x", "Repro", ids.user, now, now,
  );
  run(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)",
    createHash("sha256").update(token).digest("hex"), ids.user, now, now + 86_400_000,
  );
  run(
    "INSERT INTO workspaces (id, name, slug, timezone, settings, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    ids.ws, "Repro", "repro-ws", "UTC", "{}", now, now,
  );
  run(
    "INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at) VALUES (?,?,?,?,?)",
    "wm-repro", ids.ws, ids.user, "owner", now,
  );
  run(
    "INSERT INTO teams (id, workspace_id, key, name, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    ids.team, ids.ws, "REP", "Repro Team", "a0", now, now,
  );
  run("INSERT INTO states (id, team_id, name, category, position) VALUES (?,?,?,?,?)", ids.todo, ids.team, "Todo", "unstarted", "a0");
  run("INSERT INTO states (id, team_id, name, category, position) VALUES (?,?,?,?,?)", ids.done, ids.team, "Done", "completed", "a1");
  run("UPDATE teams SET default_state_id = ? WHERE id = ?", ids.todo, ids.team);
  run(
    "INSERT INTO projects (id, workspace_id, name, status, position, progress_cache, progress_points_cache, update_cadence, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ids.project, ids.ws, "Repro Project", "started", "a0", 0,
    JSON.stringify({ done: 0, total: 0, issuesDone: 0, issuesTotal: 0 }), "off", now, now,
  );
  run(
    "INSERT INTO issues (id, workspace_id, team_id, number, identifier, title, description_md, state_id, priority, estimate, creator_id, project_id, position, version, created_at, updated_at) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ids.issue, ids.ws, ids.team, 1, "REP-1", "Repro issue", "", ids.todo, 0, 5, ids.user, ids.project, "a0", 1, now, now,
  );
  run("INSERT INTO team_counters (team_id, next_number) VALUES (?, ?)", ids.team, 2);
  // The project starts at one open issue so only the completion can move it.
  run(
    "UPDATE projects SET progress_points_cache = ? WHERE id = ?",
    JSON.stringify({ done: 0, total: 5, issuesDone: 0, issuesTotal: 1 }), ids.project,
  );
  sqlite.close();

  return { wsId: ids.ws, issueId: ids.issue, projectId: ids.project, doneStateId: ids.done, token };
}

async function waitForServer(base: string, deadlineMs: number): Promise<void> {
  const stop = Date.now() + deadlineMs;
  while (Date.now() < stop) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok || res.status === 404) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not answer on ${base}`);
}

describe("progress consumer runs without a projects route in the process", () => {
  it("completing an issue over HTTP moves progress_cache to 100", async () => {
    ensureFreshBuild();
    expect(existsSync(ENTRY)).toBe(true);

    workdir = mkdtempSync(path.join(tmpdir(), "prodmax-repro-"));
    mkdirSync(path.join(workdir, "data"), { recursive: true });
    const dbFile = path.join(workdir, "data", "prodmax.db");
    const fixture = seed(dbFile);

    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [ENTRY], {
      cwd: workdir,
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "development" },
      stdio: "ignore",
    });
    await waitForServer(base, 30_000);

    const res = await fetch(`${base}/api/issues/${fixture.issueId}?wsId=${fixture.wsId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: `prodmax_session=${fixture.token}` },
      body: JSON.stringify({ stateId: fixture.doneStateId }),
    });
    expect(res.status).toBe(200);

    await stopServer();

    // Read-write, not readonly: the child left a WAL behind and SQLite needs
    // to recover it, which a readonly handle cannot do.
    const readback = new Database(dbFile);
    const row = readback
      .prepare("SELECT progress_cache AS cache, progress_points_cache AS points FROM projects WHERE id = ?")
      .get(fixture.projectId) as { cache: number; points: string };
    readback.close();

    expect(row.cache).toBe(100);
    expect(JSON.parse(row.points)).toEqual({ done: 5, total: 5, issuesDone: 1, issuesTotal: 1 });
  }, 300_000);
});
