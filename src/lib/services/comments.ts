import { and, asc, eq, isNull } from "drizzle-orm";
import { comments, mentions, workspaceMembers } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/guards";
import { addSubscriber } from "./issues-relations";
import { requireLiveIssue } from "./issues-scope";

function mentionIds(bodyMd: string): string[] {
  const found = new Set<string>();
  const re = /@([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyMd)) !== null) found.add(m[1]);
  return [...found];
}

function writeMentions(wsId: string, commentId: string, issueId: string, bodyMd: string): void {
  const db = currentDb();
  db.delete(mentions).where(eq(mentions.commentId, commentId)).run();
  for (const targetUserId of mentionIds(bodyMd)) {
    const member = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, targetUserId)))
      .get();
    if (!member) continue;
    db.insert(mentions)
      .values({ id: uuid7(), workspaceId: wsId, commentId, targetUserId, createdAt: Date.now() })
      .run();
    addSubscriber(issueId, targetUserId, "mentioned");
  }
}

export function listIssueComments(wsId: string, actor: { userId: string; role: Role }, issueId: string) {
  const issue = requireLiveIssue(wsId, issueId, actor.role, actor.userId);
  return currentDb()
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.workspaceId, wsId),
        eq(comments.entityType, "issue"),
        eq(comments.entityId, issue.id),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(asc(comments.createdAt))
    .all();
}

export function createIssueComment(
  wsId: string,
  actor: { userId: string; role: Role },
  issueId: string,
  input: { bodyMd: string; parentId?: string | null },
) {
  const issue = requireLiveIssue(wsId, issueId, actor.role, actor.userId);
  if (input.parentId) {
    const parent = currentDb().select().from(comments).where(eq(comments.id, input.parentId)).get();
    if (!parent || parent.entityId !== issue.id) throw new HttpError("NOT_FOUND", "Parent comment not found");
  }
  const now = Date.now();
  const id = uuid7();
  currentDb()
    .insert(comments)
    .values({
      id,
      workspaceId: wsId,
      entityType: "issue",
      entityId: issue.id,
      parentId: input.parentId ?? null,
      authorId: actor.userId,
      bodyMd: input.bodyMd,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  writeMentions(wsId, id, issue.id, input.bodyMd);
  return currentDb().select().from(comments).where(eq(comments.id, id)).get()!;
}

export function patchComment(
  actor: { userId: string; role: Role },
  commentId: string,
  input: { bodyMd?: string; resolvedAt?: number | null },
) {
  const row = currentDb().select().from(comments).where(eq(comments.id, commentId)).get();
  if (!row || row.deletedAt) throw new HttpError("NOT_FOUND", "Comment not found");
  if (input.bodyMd !== undefined && row.authorId !== actor.userId) {
    throw new HttpError("FORBIDDEN", "Only the author may edit a comment");
  }
  const now = Date.now();
  const patch: Partial<typeof comments.$inferInsert> = { updatedAt: now };
  if (input.bodyMd !== undefined) patch.bodyMd = input.bodyMd;
  if (input.resolvedAt !== undefined) {
    patch.resolvedAt = input.resolvedAt;
    patch.resolvedBy = input.resolvedAt === null ? null : actor.userId;
  }
  currentDb().update(comments).set(patch).where(eq(comments.id, commentId)).run();
  if (input.bodyMd !== undefined && row.entityType === "issue") {
    writeMentions(row.workspaceId, row.id, row.entityId, input.bodyMd);
  }
  return currentDb().select().from(comments).where(eq(comments.id, commentId)).get()!;
}

export function deleteComment(actor: { userId: string }, commentId: string) {
  const row = currentDb().select().from(comments).where(eq(comments.id, commentId)).get();
  if (!row || row.deletedAt) throw new HttpError("NOT_FOUND", "Comment not found");
  if (row.authorId !== actor.userId) throw new HttpError("FORBIDDEN", "Only the author may delete a comment");
  const now = Date.now();
  currentDb()
    .update(comments)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(comments.id, commentId))
    .run();
  return { ok: true };
}

export function loadComment(commentId: string) {
  const row = currentDb().select().from(comments).where(eq(comments.id, commentId)).get();
  if (!row || row.deletedAt) throw new HttpError("NOT_FOUND", "Comment not found");
  return row;
}
