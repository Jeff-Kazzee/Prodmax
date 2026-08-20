/**
 * Unified search (architecture §2.10, §3.6, FM-042).
 *
 * `searchWorkspace` in src/db/fts.ts is treated as a *candidate generator*,
 * never as the answer. Two things it cannot know are decided here:
 *
 *   Permissions. §7 gives guests no Docs access and no projects, and limits
 *   their issues to their own teams. `search_fts` has no team_id column, so
 *   the team rule cannot be expressed in the index at all.
 *
 *   Liveness. The page, issue and project update triggers in src/db/fts.sql
 *   fire on `deleted_at` but re-INSERT the row unconditionally, so a trashed
 *   entity stays in the index. Observed, not inferred: after soft-deleting a
 *   page and an issue, both are still returned by a MATCH. That file is
 *   M1-owned and outside this ticket's owns list, so the fix is filed as
 *   T-035 and contained here.
 *
 * So every candidate is re-resolved against its base table, which is also the
 * authoritative title: the index can be stale, the row cannot. That costs at
 * most one query per entity type, never one per hit.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { issues, pages, projects } from "@/db/schema";
import { searchWorkspace, type SearchHit, type SqliteDb } from "@/db/fts";
import { currentDb } from "@/lib/api/db";
import { HttpError } from "@/lib/api/errors";
import { requireWorkspace, type Role } from "@/lib/api/guards";
import { paginate, type Page } from "@/lib/api/paginate";
import { issueScope } from "./issues-scope";

export const SEARCH_TYPES = ["issue", "page", "project"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * How many FTS candidates to pull before filtering. The visibility pass only
 * removes rows, so this is over-fetched relative to the page size. At the
 * MAX_LIMIT of 100 it leaves five full pages of headroom; a query whose
 * visible results exceed it truncates rather than paging deeper, which is
 * stated here rather than hidden.
 */
export const CANDIDATE_WINDOW = 500;

export interface SearchHitDto {
  entityType: SearchType;
  entityId: string;
  title: string;
  score: number;
  /** Issue identifier (PRO-123) when the hit is an issue, else null. */
  identifier: string | null;
  /** Page emoji when the hit is a page, else null. */
  icon: string | null;
  updatedAt: number;
}

export interface SearchInput {
  wsId: string;
  q: string;
  types: SearchType[];
  cursor: string | null;
  limit: number;
}

export function isSearchType(value: string): value is SearchType {
  return (SEARCH_TYPES as readonly string[]).includes(value);
}

/**
 * The better-sqlite3 handle behind the active Drizzle connection.
 *
 * `searchWorkspace` needs a raw handle, and it has to be the *active* one:
 * tests install a throwaway database with `setDbOverride`, so the
 * `getSqlite()` singleton would search a different file than the one the
 * request just wrote to.
 *
 * `drizzle()` returns `BetterSQLite3Database & { $client }`, but
 * `src/db/client.ts` aliases `Db` to the bare class, which drops the
 * intersection. That file is M1-owned and outside this ticket's owns list, so
 * the property is reached through one local cast rather than by widening the
 * alias. Verified present at runtime.
 */
function rawSqlite(): SqliteDb {
  return (currentDb() as unknown as { $client: SqliteDb }).$client;
}

/**
 * Parse `?types=`. §3.6's row lists `comment` among the values, but the FTS
 * content policy in §2.10 folds comment bodies into their issue's body rather
 * than indexing comments as entities, so there is nothing a `comment` type
 * could return. Rejecting it says so; silently dropping it would make the UI
 * show an empty tab and blame the data.
 */
export function parseSearchTypes(raw: string | null): SearchType[] {
  if (raw === null || raw.trim().length === 0) return [...SEARCH_TYPES];
  const requested = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  const unknown = requested.filter((s) => !isSearchType(s));
  if (unknown.length > 0) {
    throw new HttpError("VALIDATION", "Unsupported search type", unknown.map((t) => `types: ${t}`));
  }
  return [...new Set(requested as SearchType[])];
}

/** §7: guests get no Docs and no projects, so those never reach the index. */
export function visibleTypesFor(role: Role, requested: readonly SearchType[]): SearchType[] {
  if (role !== "guest") return [...requested];
  return requested.filter((t) => t === "issue");
}

export function searchEntities(request: Request, input: SearchInput): Page<SearchHitDto> {
  const { member } = requireWorkspace(request, input.wsId);
  const types = visibleTypesFor(member.role, input.types);
  if (types.length === 0 || input.q.trim().length === 0) return { data: [], nextCursor: null };

  const hits = searchWorkspace(rawSqlite(), {
    workspaceId: input.wsId,
    query: input.q,
    entityTypes: types,
    limit: CANDIDATE_WINDOW,
  });

  const visible = resolveVisible(input.wsId, member.role, member.userId, hits);

  // bm25 ties are common, so score alone is not a total order and an offset
  // cursor over a partial order duplicates and drops rows between pages.
  visible.sort(
    (a, b) =>
      b.score - a.score ||
      b.updatedAt - a.updatedAt ||
      a.entityType.localeCompare(b.entityType) ||
      a.entityId.localeCompare(b.entityId),
  );

  return paginate(visible, input.cursor, input.limit);
}

/**
 * Re-resolve candidates against their base tables. One query per entity type
 * present in the candidate set, never one per hit.
 */
function resolveVisible(
  wsId: string,
  role: Role,
  userId: string,
  hits: readonly SearchHit[],
): SearchHitDto[] {
  const byType = new Map<SearchType, string[]>();
  const scores = new Map<string, number>();
  for (const hit of hits) {
    if (!isSearchType(hit.entityType)) continue;
    const list = byType.get(hit.entityType);
    if (list) list.push(hit.entityId);
    else byType.set(hit.entityType, [hit.entityId]);
    scores.set(`${hit.entityType}:${hit.entityId}`, hit.score);
  }

  const out: SearchHitDto[] = [];
  const scoreOf = (t: SearchType, id: string) => scores.get(`${t}:${id}`) ?? 0;

  const issueIds = byType.get("issue");
  if (issueIds && issueIds.length > 0) {
    // issueScope carries the §7 guest team rule and the live-row predicate
    // from one definition, so search and the issue list cannot disagree.
    const rows = currentDb()
      .select({
        id: issues.id,
        title: issues.title,
        identifier: issues.identifier,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .where(and(issueScope(wsId, role, userId), inArray(issues.id, issueIds)))
      .all();
    for (const r of rows) {
      out.push({
        entityType: "issue",
        entityId: r.id,
        title: r.title,
        score: scoreOf("issue", r.id),
        identifier: r.identifier,
        icon: null,
        updatedAt: r.updatedAt,
      });
    }
  }

  const pageIds = byType.get("page");
  if (pageIds && pageIds.length > 0) {
    const rows = currentDb()
      .select({ id: pages.id, title: pages.title, icon: pages.icon, updatedAt: pages.updatedAt })
      .from(pages)
      .where(and(eq(pages.workspaceId, wsId), isNull(pages.deletedAt), inArray(pages.id, pageIds)))
      .all();
    for (const r of rows) {
      out.push({
        entityType: "page",
        entityId: r.id,
        title: r.title,
        score: scoreOf("page", r.id),
        identifier: null,
        icon: r.icon,
        updatedAt: r.updatedAt,
      });
    }
  }

  const projectIds = byType.get("project");
  if (projectIds && projectIds.length > 0) {
    const rows = currentDb()
      .select({ id: projects.id, name: projects.name, updatedAt: projects.updatedAt })
      .from(projects)
      .where(and(eq(projects.workspaceId, wsId), isNull(projects.deletedAt), inArray(projects.id, projectIds)))
      .all();
    for (const r of rows) {
      out.push({
        entityType: "project",
        entityId: r.id,
        title: r.name,
        score: scoreOf("project", r.id),
        identifier: null,
        icon: null,
        updatedAt: r.updatedAt,
      });
    }
  }

  return out;
}
