/**
 * The issue-write choke-point (T-002, remediated by T-005 phases 3 to 6).
 *
 * `runIssueWrite` opens or joins the transaction and hands the body an
 * `IssueWriter`. The writer performs the UPDATE and records the transition as
 * one call, so a write that is not recorded is not expressible. Transitions
 * buffer for the whole run and flush once, inside the transaction, to a closed
 * table of consumers.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { issues, states } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import type { IssueRow } from "./issues-scope";
import { syncProjectProgress } from "./projects-progress";

export type StateRow = typeof states.$inferSelect;
export type IssueInsert = typeof issues.$inferInsert;
export type IssuePatch = Partial<IssueInsert>;

export type StateCategory =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled"
  | "triage";

const CATEGORIES: readonly string[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
  "triage",
];

function toCategory(raw: string): StateCategory {
  if (!CATEGORIES.includes(raw)) throw new Error(`Unknown state category: ${raw}`);
  return raw as StateCategory;
}

export type IssueWriteCause = "direct" | "bulk" | "undo" | "cycle";

export interface IssueTransition {
  before: IssueRow | null;
  after: IssueRow;
  workspaceId: string;
  actorId: string;
  cause: IssueWriteCause;
}

export type SseIssueEventName = "issue.created" | "issue.updated" | "issue.deleted" | "issue.moved";

/** §5 wire name, derived from the pair so it cannot drift from the rows. */
export function sseEventName(t: IssueTransition): SseIssueEventName {
  if (t.before === null) return "issue.created";
  if (t.before.teamId !== t.after.teamId) return "issue.moved";
  if (t.before.deletedAt === null && t.after.deletedAt !== null) return "issue.deleted";
  return "issue.updated";
}

/** §4.1 `patch`: the columns whose values differ across the pair. */
export function changedFields(t: IssueTransition): Partial<IssueRow> {
  const patch: Record<string, unknown> = {};
  const before = t.before;
  for (const key of Object.keys(t.after) as Array<keyof IssueRow>) {
    if (before === null || before[key] !== t.after[key]) patch[key] = t.after[key];
  }
  return patch as Partial<IssueRow>;
}

/** What a consumer receives: the run's transitions plus the batch category memo. */
export interface IssueWriteBatch {
  readonly transitions: readonly IssueTransition[];
  stateCategory(stateId: string): StateCategory;
}

export type IssueConsumer = (batch: IssueWriteBatch) => void;

export type IssueConsumerName = "progress";

const issueConsumers: Record<IssueConsumerName, IssueConsumer> = {
  progress: syncProjectProgress,
};

let extraConsumers: readonly IssueConsumer[] = [];

/**
 * Additive test seam. It cannot remove or replace a static consumer. The
 * callback is synchronous: an async one would outlive the seam it asked for.
 */
export function withIssueConsumers<T>(extra: readonly IssueConsumer[], fn: () => T): T {
  const previous = extraConsumers;
  extraConsumers = [...previous, ...extra];
  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new Error("withIssueConsumers takes a synchronous callback");
    }
    return result;
  } finally {
    extraConsumers = previous;
  }
}

const writerBrand = Symbol("issueWriter");

export interface IssueWriter {
  readonly [writerBrand]: true;
  /** The caller owns `version` here, because it already holds the one row. */
  write(before: IssueRow, patch: IssuePatch): IssueRow;
  /** Bumps `version` itself. Do not pass one, it would have to be uniform. */
  writeMany(befores: IssueRow[], patch: IssuePatch): IssueRow[];
  insert(values: IssueInsert): IssueRow;
  noteState(state: StateRow): void;
}

interface RunBuffer {
  cause: IssueWriteCause;
  transitions: IssueTransition[];
  categories: Map<string, StateCategory>;
}

let active: RunBuffer | null = null;

function categoryResolver(buffer: RunBuffer): (stateId: string) => StateCategory {
  return (stateId) => {
    const memo = buffer.categories.get(stateId);
    if (memo !== undefined) return memo;
    const row = currentDb()
      .select({ category: states.category })
      .from(states)
      .where(eq(states.id, stateId))
      .get();
    if (!row) throw new Error(`State not found while resolving category: ${stateId}`);
    const category = toCategory(row.category);
    buffer.categories.set(stateId, category);
    return category;
  };
}

function makeWriter(
  buffer: RunBuffer,
  workspaceId: string,
  actorId: string,
  cause: IssueWriteCause,
): IssueWriter {
  const record = (before: IssueRow | null, after: IssueRow): void => {
    buffer.transitions.push({ before, after, workspaceId, actorId, cause });
  };
  return {
    [writerBrand]: true,
    write(before, patch) {
      const db = currentDb();
      db.update(issues).set(patch).where(eq(issues.id, before.id)).run();
      const after = db.select().from(issues).where(eq(issues.id, before.id)).get();
      if (!after) throw new Error(`Issue vanished during write: ${before.id}`);
      record(before, after);
      return after;
    },
    writeMany(befores, patch) {
      if (befores.length === 0) return [];
      const db = currentDb();
      const ids = befores.map((row) => row.id);
      // version increments relative to each row, so one statement covers rows
      // sitting at different versions. A caller-supplied number would have to
      // be uniform, which a batched write cannot promise.
      db.update(issues)
        .set({ ...patch, version: sql`${issues.version} + 1` })
        .where(inArray(issues.id, ids))
        .run();
      const rows = db.select().from(issues).where(inArray(issues.id, ids)).all();
      const byId = new Map(rows.map((row) => [row.id, row]));
      return befores.map((before) => {
        const after = byId.get(before.id);
        if (!after) throw new Error(`Issue vanished during write: ${before.id}`);
        record(before, after);
        return after;
      });
    },
    insert(values) {
      const db = currentDb();
      db.insert(issues).values(values).run();
      const after = db.select().from(issues).where(eq(issues.id, values.id)).get();
      if (!after) throw new Error(`Issue vanished during insert: ${values.id}`);
      record(null, after);
      return after;
    },
    noteState(state) {
      buffer.categories.set(state.id, toCategory(state.category));
    },
  };
}

function flush(buffer: RunBuffer): void {
  if (buffer.transitions.length === 0) return;
  const batch: IssueWriteBatch = {
    transitions: buffer.transitions.slice(),
    stateCategory: categoryResolver(buffer),
  };
  for (const name of Object.keys(issueConsumers) as IssueConsumerName[]) {
    issueConsumers[name](batch);
  }
  for (const consumer of extraConsumers) consumer(batch);
}

/**
 * Run `body` against a writer. The outermost call owns the transaction and the
 * flush. A nested call joins the run and inherits its cause unless it names one.
 */
export function runIssueWrite<T>(
  wsId: string,
  actorId: string,
  body: (w: IssueWriter) => T,
  cause?: IssueWriteCause,
): T {
  const outer = active;
  const effective = cause ?? outer?.cause ?? "direct";
  if (outer) return body(makeWriter(outer, wsId, actorId, effective));

  const buffer: RunBuffer = { cause: effective, transitions: [], categories: new Map() };
  // The writer and every service helper read through currentDb() rather than
  // the drizzle tx handle. better-sqlite3 runs the transaction on the same
  // connection, and currentDb() is what honours the test override, so a tx
  // handle would fork these services into two access paths.
  return currentDb().transaction(() => {
    active = buffer;
    try {
      const result = body(makeWriter(buffer, wsId, actorId, effective));
      flush(buffer);
      return result;
    } finally {
      active = null;
    }
  });
}
