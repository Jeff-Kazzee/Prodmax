import { and, eq } from "drizzle-orm";
import { issueRelations, issueSubscribers, states } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";
import { recordFieldChange } from "./issues-history";
import { requireLiveIssue, type IssueRow } from "./issues-scope";

export type RelationType = "related" | "blocked_by" | "blocking" | "duplicate";

function inverseType(type: RelationType): RelationType | null {
  if (type === "blocking") return "blocked_by";
  if (type === "blocked_by") return "blocking";
  if (type === "related") return "related";
  return null;
}

export function listRelations(issueId: string) {
  return currentDb().select().from(issueRelations).where(eq(issueRelations.issueId, issueId)).all();
}

export function addRelation(
  wsId: string,
  issue: IssueRow,
  relatedIssueId: string,
  type: RelationType,
  actor: { userId: string; role: Role },
): typeof issueRelations.$inferSelect {
  if (relatedIssueId === issue.id) throw new HttpError("VALIDATION", "Cannot relate an issue to itself");
  const related = requireLiveIssue(wsId, relatedIssueId, actor.role, actor.userId);
  const db = currentDb();
  const now = Date.now();
  const existing = db
    .select()
    .from(issueRelations)
    .where(
      and(
        eq(issueRelations.issueId, issue.id),
        eq(issueRelations.relatedIssueId, related.id),
        eq(issueRelations.type, type),
      ),
    )
    .get();
  if (existing) throw new HttpError("CONFLICT", "Relation already exists");

  const id = uuid7();
  db.insert(issueRelations)
    .values({
      id,
      workspaceId: wsId,
      issueId: issue.id,
      relatedIssueId: related.id,
      type,
      createdBy: actor.userId,
      createdAt: now,
    })
    .run();

  const inv = inverseType(type);
  if (inv) {
    const invExists = db
      .select()
      .from(issueRelations)
      .where(
        and(
          eq(issueRelations.issueId, related.id),
          eq(issueRelations.relatedIssueId, issue.id),
          eq(issueRelations.type, inv),
        ),
      )
      .get();
    if (!invExists) {
      db.insert(issueRelations)
        .values({
          id: uuid7(),
          workspaceId: wsId,
          issueId: related.id,
          relatedIssueId: issue.id,
          type: inv,
          createdBy: actor.userId,
          createdAt: now,
        })
        .run();
    }
  }
  recordFieldChange(issue, actor.userId, "relations", null, { relatedIssueId: related.id, type }, now);
  return db.select().from(issueRelations).where(eq(issueRelations.id, id)).get()!;
}

export function removeRelation(issue: IssueRow, relatedIssueId: string, type: RelationType, actorId: string): void {
  const db = currentDb();
  const row = db
    .select()
    .from(issueRelations)
    .where(
      and(
        eq(issueRelations.issueId, issue.id),
        eq(issueRelations.relatedIssueId, relatedIssueId),
        eq(issueRelations.type, type),
      ),
    )
    .get();
  if (!row) throw new HttpError("NOT_FOUND", "Relation not found");
  db.delete(issueRelations).where(eq(issueRelations.id, row.id)).run();
  const inv = inverseType(type);
  if (inv) {
    db.delete(issueRelations)
      .where(
        and(
          eq(issueRelations.issueId, relatedIssueId),
          eq(issueRelations.relatedIssueId, issue.id),
          eq(issueRelations.type, inv),
        ),
      )
      .run();
  }
  recordFieldChange(issue, actorId, "relations", { relatedIssueId, type }, null, Date.now());
}

/** When a blocker is resolved (completed/canceled), downgrade both sides to related (FM-016). */
export function downgradeBlockersIfResolved(issue: IssueRow, stateId: string): void {
  const state = currentDb().select().from(states).where(eq(states.id, stateId)).get();
  if (!state || (state.category !== "completed" && state.category !== "canceled")) return;
  const db = currentDb();
  const outgoing = db
    .select()
    .from(issueRelations)
    .where(and(eq(issueRelations.issueId, issue.id), eq(issueRelations.type, "blocking")))
    .all();
  for (const rel of outgoing) {
    db.update(issueRelations).set({ type: "related" }).where(eq(issueRelations.id, rel.id)).run();
    const inv = db
      .select()
      .from(issueRelations)
      .where(
        and(
          eq(issueRelations.issueId, rel.relatedIssueId),
          eq(issueRelations.relatedIssueId, issue.id),
          eq(issueRelations.type, "blocked_by"),
        ),
      )
      .get();
    if (inv) db.update(issueRelations).set({ type: "related" }).where(eq(issueRelations.id, inv.id)).run();
  }
}

export function listSubscribers(issueId: string) {
  return currentDb().select().from(issueSubscribers).where(eq(issueSubscribers.issueId, issueId)).all();
}

export function addSubscriber(issueId: string, userId: string, reason: "created" | "assigned" | "mentioned" | "manual"): void {
  const db = currentDb();
  const existing = db
    .select()
    .from(issueSubscribers)
    .where(and(eq(issueSubscribers.issueId, issueId), eq(issueSubscribers.userId, userId)))
    .get();
  if (existing) return;
  db.insert(issueSubscribers)
    .values({ issueId, userId, reason, createdAt: Date.now() })
    .run();
}

export function removeSubscriber(issueId: string, userId: string): void {
  const db = currentDb();
  const existing = db
    .select()
    .from(issueSubscribers)
    .where(and(eq(issueSubscribers.issueId, issueId), eq(issueSubscribers.userId, userId)))
    .get();
  if (!existing) throw new HttpError("NOT_FOUND", "Subscriber not found");
  db.delete(issueSubscribers)
    .where(and(eq(issueSubscribers.issueId, issueId), eq(issueSubscribers.userId, userId)))
    .run();
}
