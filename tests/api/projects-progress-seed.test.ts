/**
 * T-025. The demo bench must carry caches it derived, not caches someone typed.
 *
 * The seed used to hard-code `progress_cache` and a two-field
 * `progress_points_cache` beside the issue inserts. Reads never recompute
 * (architecture §9), so those numbers were served as fact until something
 * happened to write an issue on the project, and one of them was wrong: the
 * Onboarding project claimed 29% over rows that come to 14%.
 *
 * The seed computes its aggregate in raw SQL, because node runs that file
 * directly and cannot resolve the `@/` alias the services layer imports
 * through. These tests close the gap from the other side by running the real
 * `repairProjectProgress` over a freshly seeded database and requiring it to
 * agree, so the two implementations are pinned to each other rather than
 * merely both existing.
 */
import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { seedDemo } from "../../scripts/seed";
import {
  parseProgressPoints,
  repairAllProjects,
  repairProjectProgress,
} from "@/lib/services/projects-progress";
import { createApiDb, teardownApiDb } from "./helpers";

afterEach(teardownApiDb);

interface ProjectRow {
  id: string;
  name: string;
  progress_cache: number;
  progress_points_cache: string | null;
}

function seeded(): { sqlite: Database.Database; wsId: string; projects: ProjectRow[] } {
  const sqlite = createApiDb();
  seedDemo(sqlite);
  const wsId = (sqlite.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: string }).id;
  const projects = sqlite
    .prepare("SELECT id, name, progress_cache, progress_points_cache FROM projects")
    .all() as ProjectRow[];
  return { sqlite, wsId, projects };
}

function readProject(sqlite: Database.Database, id: string): ProjectRow {
  return sqlite
    .prepare("SELECT id, name, progress_cache, progress_points_cache FROM projects WHERE id = ?")
    .get(id) as ProjectRow;
}

describe("seeded project progress caches", () => {
  it("stores the current four-field shape, not the legacy pair", () => {
    const { projects } = seeded();
    expect(projects.length).toBeGreaterThan(0);

    for (const project of projects) {
      // parseProgressPoints returns null for the legacy `{done,total}` row,
      // which is the degraded path the UI renders as "counts unavailable". The
      // demo bench used to start there, on every project.
      const points = parseProgressPoints(project.progress_points_cache);
      expect(points, `${project.name} cache: ${project.progress_points_cache}`).not.toBeNull();
    }
  });

  it("agrees with what the service computes for the same rows", () => {
    const { sqlite, wsId, projects } = seeded();

    for (const project of projects) {
      const asSeeded = readProject(sqlite, project.id);

      // Perturb first. Running an idempotent repair over a correct row and
      // asserting it is unchanged proves nothing, because the repair would
      // rewrite the same numbers over a wrong row too. Only a wrong starting
      // value makes the comparison capable of failing.
      sqlite
        .prepare("UPDATE projects SET progress_cache = 99, progress_points_cache = ? WHERE id = ?")
        .run(JSON.stringify({ done: 1, total: 1, issuesDone: 1, issuesTotal: 1 }), project.id);
      expect(readProject(sqlite, project.id).progress_cache).toBe(99);

      repairProjectProgress(wsId, project.id);
      const repaired = readProject(sqlite, project.id);

      expect(repaired.progress_cache, `${project.name} percent`).toBe(asSeeded.progress_cache);
      expect(
        parseProgressPoints(repaired.progress_points_cache),
        `${project.name} counts`,
      ).toEqual(parseProgressPoints(asSeeded.progress_points_cache));
    }
  });

  it("survives the workspace-wide sweep unchanged", () => {
    // repairAllProjects is the documented reconciliation entry point and had
    // no caller anywhere in src, tests or scripts, which is why the drift it
    // exists to correct went unnoticed. This is its exercise until the
    // operator-facing reconcile lands with T-019.
    const { sqlite, wsId, projects } = seeded();
    const before = projects.map((p) => readProject(sqlite, p.id));

    // Perturb every project, so a sweep that silently did nothing fails here.
    sqlite.prepare("UPDATE projects SET progress_cache = 77, progress_points_cache = NULL").run();
    expect(readProject(sqlite, projects[0]!.id).progress_cache).toBe(77);

    repairAllProjects(wsId);

    for (const original of before) {
      const after = readProject(sqlite, original.id);
      expect(after.progress_cache, `${original.name} percent`).toBe(original.progress_cache);
      expect(parseProgressPoints(after.progress_points_cache), `${original.name} counts`).toEqual(
        parseProgressPoints(original.progress_points_cache),
      );
    }
  });

  it("counts real work, so the bench is not uniformly empty", () => {
    // Guards the pinning test above against passing because both sides read
    // zero. A seed that attached no issues to any project would satisfy
    // "service agrees" trivially.
    const { projects } = seeded();
    const totals = projects.map((p) => parseProgressPoints(p.progress_points_cache));

    expect(totals.every((t) => t !== null)).toBe(true);
    expect(totals.some((t) => (t?.issuesTotal ?? 0) > 0)).toBe(true);
    expect(totals.some((t) => (t?.issuesDone ?? 0) > 0)).toBe(true);
  });
});

describe("seeded cycle snapshot", () => {
  it("freezes stats in the shape the reader parses", () => {
    const { sqlite } = seeded();
    const row = sqlite
      .prepare("SELECT name, stats_snapshot FROM cycles WHERE status = 'completed'")
      .get() as { name: string; stats_snapshot: string | null };

    expect(row.stats_snapshot).not.toBeNull();
    const parsed = JSON.parse(String(row.stats_snapshot)) as {
      scope?: { issues?: number; points?: number };
      completed?: { issues?: number; points?: number };
    };

    // The old row was {completed, carried, points}, which parseStats rejects
    // into zeros, so a closed cycle with real work rendered as one that did
    // nothing, under an "as of close" caption asserting those zeros.
    expect(typeof parsed.scope?.issues).toBe("number");
    expect(typeof parsed.scope?.points).toBe("number");
    expect(typeof parsed.completed?.issues).toBe("number");
    expect(typeof parsed.completed?.points).toBe("number");
    expect(parsed.scope?.issues ?? 0).toBeGreaterThan(0);
  });
});
