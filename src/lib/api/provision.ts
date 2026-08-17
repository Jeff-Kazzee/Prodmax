/**
 * Workspace provisioning (M1b): POST /api/workspaces creates the
 * workspace, an owner membership, a default PRO team with five workflow
 * states, and four starter workspace labels.
 */
import { eq } from "drizzle-orm";
import { labels, states, teamCounters, teams, workspaceMembers, workspaces } from "@/db/schema";
import { uuid7 } from "@/db/ids";
import { generateKeyBetween } from "@/db/positions";
import { currentDb } from "./db";
import { HttpError } from "./errors";

const DEFAULT_STATES: Array<{ name: string; category: string; color: string }> = [
  { name: "Backlog", category: "backlog", color: "#95a2b3" },
  { name: "Todo", category: "unstarted", color: "#e2e2e2" },
  { name: "In Progress", category: "started", color: "#f2c94c" },
  { name: "Done", category: "completed", color: "#5e6ad2" },
  { name: "Canceled", category: "canceled", color: "#95a2b3" },
];

const STARTER_LABELS: Array<{ name: string; color: string }> = [
  { name: "Bug", color: "#e5484d" },
  { name: "Feature", color: "#4cb782" },
  { name: "Improvement", color: "#f5a524" },
  { name: "Documentation", color: "#70a7db" },
];

/** Lowercase slug: [a-z0-9-]{3,40}, dashes collapsed, edges trimmed. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length >= 3 ? slug : `${slug || "ws"}`.padEnd(3, "0");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,40}$/.test(slug) && !slug.startsWith("-");
}

/**
 * Create the workspace + defaults transactionally. Caller validates the
 * slug; uniqueness is re-checked here → 409 CONFLICT when taken.
 */
export function provisionWorkspace(
  userId: string,
  input: { name: string; slug: string; timezone: string },
): { workspaceId: string; teamId: string; defaultStateIds: string[] } {
  const db = currentDb();
  const taken = db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, input.slug)).get();
  if (taken) throw new HttpError("CONFLICT", "Slug already taken", [`slug: ${input.slug}`]);

  const now = Date.now();
  const workspaceId = uuid7();
  const teamId = uuid7();
  const defaultStateIds: string[] = [];

  db.transaction((tx) => {
    tx.insert(workspaces)
      .values({ id: workspaceId, name: input.name, slug: input.slug, timezone: input.timezone, createdAt: now, updatedAt: now })
      .run();
    tx.insert(workspaceMembers)
      .values({ id: uuid7(), workspaceId, userId, role: "owner", createdAt: now })
      .run();
    tx.insert(teams)
      .values({
        id: teamId,
        workspaceId,
        key: "PRO",
        name: "Product",
        position: generateKeyBetween(null, null),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(teamCounters).values({ teamId, nextNumber: 1 }).run();

    let prev: string | null = null;
    for (const state of DEFAULT_STATES) {
      const position = generateKeyBetween(prev, null);
      const stateId = uuid7();
      tx.insert(states).values({ id: stateId, teamId, ...state, position }).run();
      defaultStateIds.push(stateId);
      prev = position;
    }
    // "Todo" (index 1) is the team's default state.
    tx.update(teams).set({ defaultStateId: defaultStateIds[1] }).where(eq(teams.id, teamId)).run();

    for (const label of STARTER_LABELS) {
      tx.insert(labels)
        .values({ id: uuid7(), workspaceId, teamId: null, name: label.name, color: label.color, createdAt: now })
        .run();
    }
  });

  return { workspaceId, teamId, defaultStateIds };
}
