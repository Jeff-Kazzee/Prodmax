/**
 * Cycles service (M4a; architecture §2.4/§3.5, FM-031/032/033).
 *
 * Status is derived+stored: 'future' when starts_at > now, else 'active';
 * 'completed' is only ever set by closeCycle. Close freezes stats_snapshot
 * (§9: never recomputed on read) and rolls open issues (state category not
 * completed/canceled, not deleted) into the next cycle, auto-creating it
 * when none exists. better-sqlite3 sync calls live in this layer only;
 * every query is workspace-scoped (§7).
 */
import { and, asc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { cycles, issues, states, teamMembers } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";
import type { z } from "zod";
import type { createCycleSchema, cycleScopeSchema, patchCycleSchema } from "@/lib/validation/cycles";
import { requireTeamInWorkspace } from "./issues-helpers";
import { runIssueWrite } from "./issues-events";
import { recordFieldChange } from "./issues-history";
import type { IssueRow } from "./issues-scope";

export type CreateCycleInput = z.infer<typeof createCycleSchema>;
export type PatchCycleInput = z.infer<typeof patchCycleSchema>;
export type CycleScopeInput = z.infer<typeof cycleScopeSchema>;

export type CycleRow = typeof cycles.$inferSelect;

export interface CycleStats {
  scope: { issues: number; points: number };
  completed: { issues: number; points: number };
}

export type CycleDto = Omit<CycleRow, "statsSnapshot"> & { stats: CycleStats };

const EMPTY_STATS: CycleStats = { scope: { issues: 0, points: 0 }, completed: { issues: 0, points: 0 } };

function deriveStatus(startsAt: number, now: number): "future" | "active" {
  return startsAt > now ? "future" : "active";
}

function assertValidWindow(startsAt: number, endsAt: number): void {
  if (startsAt >= endsAt) {
    throw new HttpError("VALIDATION", "startsAt must be before endsAt", ["startsAt: must be before endsAt"]);
  }
}

/** Guests only touch cycles of teams they belong to (§7), mirroring issues. */
function assertCycleTeamAccess(role: Role, userId: string, teamId: string): void {
  if (role !== "guest") return;
  const mine = currentDb()
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .all()
    .map((r) => r.teamId);
  if (!mine.includes(teamId)) throw new HttpError("NOT_FOUND", "Cycle not found");
}

/**
 * §2.4 calls status derived+stored, but nothing revisits a row once written, so
 * a cycle that starts tomorrow reports 'future' forever. Re-derive on read and
 * persist the difference, one statement per distinct target status. Writing on a
 * GET is a single enum per stale row, not the counter recompute §9 forbids.
 * 'completed' is closeCycle's alone and is never re-derived.
 */
function syncDerivedStatus(rows: CycleRow[]): CycleRow[] {
  const now = Date.now();
  const stale = new Map<"future" | "active", string[]>();
  const synced = rows.map((row) => {
    if (row.status === "completed") return row;
    const derived = deriveStatus(row.startsAt, now);
    if (derived === row.status) return row;
    const ids = stale.get(derived);
    if (ids) ids.push(row.id);
    else stale.set(derived, [row.id]);
    return { ...row, status: derived };
  });
  for (const [status, ids] of stale) {
    currentDb().update(cycles).set({ status }).where(inArray(cycles.id, ids)).run();
  }
  return synced;
}

function requireCycle(wsId: string, id: string): CycleRow {
  const row = currentDb().select().from(cycles).where(eq(cycles.id, id)).get();
  if (!row || row.workspaceId !== wsId) throw new HttpError("NOT_FOUND", "Cycle not found");
  return syncDerivedStatus([row])[0];
}

/**
 * Live stats per cycle: non-deleted issues whose state category is not
 * 'canceled'; 'completed' counts the completed-category subset (§2.4).
 * Points are SUM(COALESCE(estimate, 0)). One grouped query, no N+1.
 */
function statsByCycleIds(wsId: string, ids: string[]): Map<string, CycleStats> {
  const map = new Map<string, CycleStats>();
  if (ids.length === 0) return map;
  const rows = currentDb()
    .select({
      cycleId: issues.cycleId,
      scopeIssues: sql<number>`COUNT(*)`.mapWith(Number),
      scopePoints: sql<number>`COALESCE(SUM(COALESCE(${issues.estimate}, 0)), 0)`.mapWith(Number),
      completedIssues:
        sql<number>`COALESCE(SUM(CASE WHEN ${states.category} = 'completed' THEN 1 ELSE 0 END), 0)`.mapWith(Number),
      completedPoints:
        sql<number>`COALESCE(SUM(CASE WHEN ${states.category} = 'completed' THEN COALESCE(${issues.estimate}, 0) ELSE 0 END), 0)`.mapWith(Number),
    })
    .from(issues)
    .innerJoin(states, eq(states.id, issues.stateId))
    .where(
      and(
        eq(issues.workspaceId, wsId),
        isNull(issues.deletedAt),
        ne(states.category, "canceled"),
        inArray(issues.cycleId, ids),
      ),
    )
    .groupBy(issues.cycleId)
    .all();
  for (const r of rows) {
    if (r.cycleId === null) continue;
    map.set(r.cycleId, {
      scope: { issues: r.scopeIssues, points: r.scopePoints },
      completed: { issues: r.completedIssues, points: r.completedPoints },
    });
  }
  return map;
}

/** A malformed snapshot reads as empty stats rather than 500ing every list. */
function parseStats(raw: string | null): CycleStats | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CycleStats>;
    const scope = parsed.scope;
    const completed = parsed.completed;
    if (
      typeof scope?.issues === "number" &&
      typeof scope.points === "number" &&
      typeof completed?.issues === "number" &&
      typeof completed.points === "number"
    ) {
      return {
        scope: { issues: scope.issues, points: scope.points },
        completed: { issues: completed.issues, points: completed.points },
      };
    }
  } catch {
    /* malformed snapshot → empty stats */
  }
  return EMPTY_STATS;
}

/** Completed cycles serve the snapshot frozen at close — never recompute (§9). */
function statsFor(wsId: string, row: CycleRow): CycleStats {
  if (row.status === "completed") {
    const frozen = parseStats(row.statsSnapshot);
    if (frozen) return frozen;
  }
  return statsByCycleIds(wsId, [row.id]).get(row.id) ?? EMPTY_STATS;
}

function serialize(row: CycleRow, stats: CycleStats): CycleDto {
  const { statsSnapshot, ...rest } = row;
  return { ...rest, stats };
}

/**
 * The allocator. `teams.next_cycle_number` is dead: nothing reads or writes it.
 * Dropping it needs a schema edit and a migration that has to serialize at the
 * integration checkpoint, so it stays until a ticket carries that migration.
 */
function maxNumberForTeam(teamId: string): number {
  const row = currentDb()
    .select({ n: sql<number>`COALESCE(MAX(${cycles.number}), 0)`.mapWith(Number) })
    .from(cycles)
    .where(eq(cycles.teamId, teamId))
    .get();
  return row?.n ?? 0;
}

export function listCycles(wsId: string, actor: { userId: string; role: Role }, teamId: string): CycleDto[] {
  const team = requireTeamInWorkspace(wsId, teamId);
  assertCycleTeamAccess(actor.role, actor.userId, team.id);
  const rows = syncDerivedStatus(
    currentDb()
      .select()
      .from(cycles)
      .where(and(eq(cycles.workspaceId, wsId), eq(cycles.teamId, team.id)))
      .orderBy(asc(cycles.number))
      .all(),
  );
  const live = statsByCycleIds(
    wsId,
    rows.filter((r) => r.status !== "completed").map((r) => r.id),
  );
  return rows.map((row) =>
    serialize(row, (row.status === "completed" ? parseStats(row.statsSnapshot) : null) ?? live.get(row.id) ?? EMPTY_STATS),
  );
}

export function createCycle(
  wsId: string,
  actor: { userId: string; role: Role },
  input: CreateCycleInput,
): CycleDto {
  const team = requireTeamInWorkspace(wsId, input.teamId);
  assertCycleTeamAccess(actor.role, actor.userId, team.id);
  assertValidWindow(input.startsAt, input.endsAt);
  const now = Date.now();
  const number = input.number ?? maxNumberForTeam(team.id) + 1;
  const id = uuid7();
  try {
    currentDb()
      .insert(cycles)
      .values({
        id,
        workspaceId: wsId,
        teamId: team.id,
        number,
        name: input.name ?? `Cycle ${number}`,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: deriveStatus(input.startsAt, now),
        closedAt: null,
        statsSnapshot: null,
        createdAt: now,
      })
      .run();
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed: cycles.")) {
      throw new HttpError("CONFLICT", "Cycle number already exists for this team", [`number: ${number}`]);
    }
    throw err;
  }
  const row = currentDb().select().from(cycles).where(eq(cycles.id, id)).get()!;
  return serialize(row, statsFor(wsId, row));
}

export function patchCycle(
  wsId: string,
  actor: { userId: string; role: Role },
  id: string,
  input: PatchCycleInput,
): CycleDto {
  const cycle = requireCycle(wsId, id);
  assertCycleTeamAccess(actor.role, actor.userId, cycle.teamId);
  if (cycle.status === "completed") throw new HttpError("CONFLICT", "Completed cycles are immutable");
  const startsAt = input.startsAt ?? cycle.startsAt;
  const endsAt = input.endsAt ?? cycle.endsAt;
  assertValidWindow(startsAt, endsAt);
  currentDb()
    .update(cycles)
    .set({ name: input.name ?? cycle.name, startsAt, endsAt, status: deriveStatus(startsAt, Date.now()) })
    .where(eq(cycles.id, cycle.id))
    .run();
  const row = currentDb().select().from(cycles).where(eq(cycles.id, cycle.id)).get()!;
  return serialize(row, statsFor(wsId, row));
}

export function updateCycleScope(
  wsId: string,
  actor: { userId: string; role: Role },
  id: string,
  input: CycleScopeInput,
): { cycle: CycleDto; scope: CycleStats["scope"] } {
  const cycle = requireCycle(wsId, id);
  assertCycleTeamAccess(actor.role, actor.userId, cycle.teamId);
  if (cycle.status === "completed") throw new HttpError("CONFLICT", "Completed cycle scope is frozen");
  const add = [...new Set(input.add ?? [])];
  const remove = [...new Set(input.remove ?? [])];
  const touched = [...new Set([...add, ...remove])];
  const latest = new Map<string, IssueRow>();
  if (touched.length > 0) {
    const found = currentDb().select().from(issues).where(inArray(issues.id, touched)).all();
    for (const row of found) latest.set(row.id, row);
    const offending = touched.filter((issueId) => {
      const row = latest.get(issueId);
      return !row || row.workspaceId !== wsId || row.deletedAt !== null || row.teamId !== cycle.teamId;
    });
    if (offending.length > 0) {
      throw new HttpError("VALIDATION", "Issues must be live issues of the cycle's team", offending);
    }
  }
  const now = Date.now();
  runIssueWrite(
    wsId,
    actor.userId,
    (w) => {
      // remove before add: an id present in both lists ends up added.
      const removing = remove.map((issueId) => latest.get(issueId)!).filter((row) => row.cycleId === cycle.id);
      for (const row of removing) recordFieldChange(row, actor.userId, "cycle", row.cycleId, null, now);
      for (const after of w.writeMany(removing, { cycleId: null, updatedAt: now })) latest.set(after.id, after);

      const adding = add.map((issueId) => latest.get(issueId)!).filter((row) => row.cycleId !== cycle.id);
      for (const row of adding) recordFieldChange(row, actor.userId, "cycle", row.cycleId, cycle.id, now);
      w.writeMany(adding, { cycleId: cycle.id, updatedAt: now });
    },
    "cycle",
  );
  const row = currentDb().select().from(cycles).where(eq(cycles.id, cycle.id)).get()!;
  const stats = statsFor(wsId, row);
  return { cycle: serialize(row, stats), scope: stats.scope };
}

export function closeCycle(
  wsId: string,
  actor: { userId: string; role: Role },
  id: string,
): { cycle: CycleDto; rollover: { count: number; nextCycleId: string; nextCycleCreated: boolean } } {
  const cycle = requireCycle(wsId, id);
  assertCycleTeamAccess(actor.role, actor.userId, cycle.teamId);
  if (cycle.status === "completed") throw new HttpError("CONFLICT", "Cycle is already closed");
  const now = Date.now();

  const result = runIssueWrite(wsId, actor.userId, (w) => {
    // (1) freeze stats at close time (FM-033).
    const stats = statsByCycleIds(wsId, [cycle.id]).get(cycle.id) ?? EMPTY_STATS;

    // (2) next cycle: earliest non-completed cycle starting at or after this one
    // ends (FM-031). §2.4 describes rollover chronologically, and numbers
    // diverge from dates as soon as a cycle is created out of order.
    let next = currentDb()
      .select()
      .from(cycles)
      .where(
        and(
          eq(cycles.teamId, cycle.teamId),
          ne(cycles.id, cycle.id),
          ne(cycles.status, "completed"),
          gte(cycles.startsAt, cycle.endsAt),
        ),
      )
      .orderBy(asc(cycles.startsAt))
      .limit(1)
      .get();
    let nextCycleCreated = false;
    if (!next) {
      // Normally this number + 1; skip past existing higher numbers if
      // cycles were closed out of order so the team UNIQUE holds.
      const number = Math.max(cycle.number + 1, maxNumberForTeam(cycle.teamId) + 1);
      const duration = cycle.endsAt - cycle.startsAt;
      const nextId = uuid7();
      currentDb()
        .insert(cycles)
        .values({
          id: nextId,
          workspaceId: wsId,
          teamId: cycle.teamId,
          number,
          name: `Cycle ${number}`,
          startsAt: cycle.endsAt,
          endsAt: cycle.endsAt + duration,
          status: deriveStatus(cycle.endsAt, now),
          closedAt: null,
          statsSnapshot: null,
          createdAt: now,
        })
        .run();
      next = currentDb().select().from(cycles).where(eq(cycles.id, nextId)).get()!;
      nextCycleCreated = true;
    }

    // (3) rollover: open issues (state category not completed/canceled) move on.
    const open = currentDb()
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.cycleId, cycle.id),
          isNull(issues.deletedAt),
          sql`${issues.stateId} IN (SELECT id FROM states WHERE category NOT IN ('completed','canceled'))`,
        ),
      )
      .all();
    for (const row of open) recordFieldChange(row, actor.userId, "cycle", cycle.id, next.id, now);
    w.writeMany(open, { cycleId: next.id, updatedAt: now });

    // (4) mark completed with the frozen snapshot.
    currentDb()
      .update(cycles)
      .set({ status: "completed", closedAt: now, statsSnapshot: JSON.stringify(stats) })
      .where(eq(cycles.id, cycle.id))
      .run();
    return { stats, rolled: open.length, nextCycleId: next.id, nextCycleCreated };
  }, "cycle");

  const row = currentDb().select().from(cycles).where(eq(cycles.id, cycle.id)).get()!;
  return {
    cycle: serialize(row, result.stats),
    rollover: { count: result.rolled, nextCycleId: result.nextCycleId, nextCycleCreated: result.nextCycleCreated },
  };
}
