/**
 * PATCH/DELETE /api/states/:id — admin+, workspace-scoped via the
 * state's team. DELETE refused (409) for a team's last state so every
 * team always keeps a workflow.
 *
 * T-023: both handlers are counter-affecting writes (architecture §9 row 3).
 * Changing `category` changes what every issue in the state contributes to its
 * project's materialized counters, and DELETE reassigns those issues outright.
 * Reads never recompute, so neither self-heals. PATCH repairs each affected
 * project. DELETE routes the reassignment through the issue-write choke-point
 * so the existing progress consumer sees the transitions. Both run in one
 * transaction, so a failed repair cannot leave the state edited and the
 * counters stale.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { issues, states, teams } from "@/db/schema";
import { currentDb } from "@/lib/api/db";
import { HttpError, json, route } from "@/lib/api/errors";
import { requireWorkspace } from "@/lib/api/guards";
import { parseBodyOptional } from "@/lib/api/parse";
import { runIssueWrite } from "@/lib/services/issues-events";
import { stateTimestamps } from "@/lib/services/issues-helpers";
import { recordFieldChange } from "@/lib/services/issues-history";
import { downgradeBlockersIfResolved } from "@/lib/services/issues-relations";
import { repairProjectProgress } from "@/lib/services/projects-progress";

type Ctx = { request: Request; params: Record<string, string | undefined> };

const CATEGORIES = ["backlog", "unstarted", "started", "completed", "canceled", "triage"] as const;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  category: z.enum(CATEGORIES).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

function loadState(request: Request, stateId: string | undefined, minRole?: "admin") {
  const db = currentDb();
  const state = db.select().from(states).where(eq(states.id, stateId as string)).get();
  if (!state) throw new HttpError("NOT_FOUND", "State not found");
  const team = db.select().from(teams).where(eq(teams.id, state.teamId)).get();
  if (!team) throw new HttpError("NOT_FOUND", "State not found");
  const { ctx } = requireWorkspace(request, team.workspaceId, minRole);
  return { state, team, actorId: ctx.user.id };
}

/**
 * Projects that own at least one live issue in this state, so a category
 * change owes each of them a repair. Trashed issues contribute to no counter
 * in either category, so they cannot make a project's cache move.
 */
function projectsHoldingIssuesIn(wsId: string, stateId: string): string[] {
  return currentDb()
    .select({ projectId: issues.projectId })
    .from(issues)
    .where(
      and(
        eq(issues.workspaceId, wsId),
        eq(issues.stateId, stateId),
        isNotNull(issues.projectId),
        isNull(issues.deletedAt),
      ),
    )
    .groupBy(issues.projectId)
    .all()
    // The WHERE already excludes nulls. flatMap narrows without a cast saying so.
    .flatMap((row) => (row.projectId === null ? [] : [row.projectId]));
}

export const PATCH = route(async (ctx: Ctx) => {
  const { state, team } = loadState(ctx.request, ctx.params.id, "admin");
  const body = await parseBodyOptional(ctx.request, patchSchema);

  const db = currentDb();
  if (body.name !== undefined && body.name !== state.name) {
    const dup = db
      .select({ id: states.id, name: states.name })
      .from(states)
      .where(eq(states.teamId, state.teamId))
      .all()
      .find((s) => s.name === body.name);
    if (dup) throw new HttpError("CONFLICT", "State name already used in this team", [`name: ${body.name}`]);
  }

  const patch: Partial<typeof states.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.category !== undefined) patch.category = body.category;
  if (body.color !== undefined) patch.color = body.color;
  if (Object.keys(patch).length > 0) {
    db.transaction(() => {
      // Re-read inside the transaction. `state` was loaded before the body was
      // awaited, and `parseBodyOptional` suspends on `request.text()`. A
      // concurrent PATCH landing in that gap would make the snapshot's category
      // stale, and comparing against it skips the repair that write just made
      // necessary. Better-sqlite3 is synchronous, so the re-read inside the
      // transaction is ordered against any other writer.
      const current = db.select().from(states).where(eq(states.id, state.id)).get();
      if (!current) throw new HttpError("NOT_FOUND", "State not found");
      // A rename or a recolor changes nothing a counter reads, so it owes no repair.
      const recategorized = body.category !== undefined && body.category !== current.category;
      db.update(states).set(patch).where(eq(states.id, state.id)).run();
      if (!recategorized) return;
      // No issue joins or leaves a project here. Only what each one contributes
      // changes, so the affected set reads the same before or after the UPDATE.
      for (const projectId of projectsHoldingIssuesIn(team.workspaceId, state.id)) {
        repairProjectProgress(team.workspaceId, projectId);
      }
    });
  }
  return json({ state: db.select().from(states).where(eq(states.id, state.id)).get() });
});

export const DELETE = route(async (ctx: Ctx) => {
  const { state, team, actorId } = loadState(ctx.request, ctx.params.id, "admin");
  const db = currentDb();
  const siblings = db.select().from(states).where(eq(states.teamId, state.teamId)).all();
  if (siblings.length <= 1) {
    throw new HttpError("CONFLICT", "Cannot delete the team's last state");
  }
  const remaining = siblings.filter((s) => s.id !== state.id);
  // The team default when it survives, otherwise an arbitrary sibling.
  let fallback = remaining.find((s) => s.id === team.defaultStateId) ?? remaining[0];
  const teamPatch: Partial<typeof teams.$inferInsert> = {};
  if (team.defaultStateId === state.id) teamPatch.defaultStateId = fallback.id;
  if (team.triageStateId === state.id) {
    // Pre-existing shape, preserved deliberately: repointing triage also moves
    // the issue fallback, so issues land on the new triage state rather than
    // the team default. Unreachable today, nothing in src/ writes
    // triageStateId. Untangling it is a behavior change no test can justify.
    const triageSibling = remaining.find((s) => s.id !== teamPatch.defaultStateId);
    fallback = triageSibling ?? fallback;
    teamPatch.triageStateId = fallback.id;
  }

  const now = Date.now();
  // runIssueWrite owns the transaction, so the team repoint, the reassignment,
  // the progress flush, and the state delete either all land or none do.
  const reassigned = runIssueWrite(team.workspaceId, actorId, (w) => {
    // The consumer resolves a transition's state category by id, at flush time,
    // which is after this body has deleted the row. Memoize both sides first or
    // that lookup throws.
    w.noteState(state);
    w.noteState(fallback);
    if (Object.keys(teamPatch).length > 0) {
      db.update(teams).set(teamPatch).where(eq(teams.id, team.id)).run();
    }
    // No deletedAt filter: the FK on issues.state_id has no ON DELETE action,
    // so every row must be repointed or the delete below aborts.
    const befores = db
      .select()
      .from(issues)
      .where(and(eq(issues.workspaceId, team.workspaceId), eq(issues.stateId, state.id)))
      .all();
    for (const before of befores) {
      // Per row, not writeMany: stateTimestamps reads each issue's own
      // startedAt and completedAt, so the patch is not uniform across the batch.
      // The consumer still folds the whole run into one UPDATE per project.
      if (before.deletedAt === null) {
        recordFieldChange(before, actorId, "state", before.stateId, fallback.id, now);
      }
      w.write(before, {
        stateId: fallback.id,
        updatedAt: now,
        version: before.version + 1,
        ...stateTimestamps(before, fallback, now),
      });
      // Parity with the canonical state change in updateIssue: landing in a
      // completed or canceled category downgrades this issue's blocks (FM-016).
      if (before.deletedAt === null) downgradeBlockersIfResolved(before, fallback.id);
    }
    // Last: the FK above is still pointing here until every write lands.
    db.delete(states).where(eq(states.id, state.id)).run();
    return befores.length;
  });
  // The cascade is invisible otherwise: nothing else tells a client that this
  // delete moved n issues, or where they went.
  return json({ ok: true, reassigned, fallbackStateId: fallback.id });
});
