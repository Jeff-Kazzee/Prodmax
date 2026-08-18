/** Issues API: move-team, relations, bulk/undo, history fold, comments. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { POST as createIssue } from "@/pages/api/issues/index";
import { PATCH as patchIssue } from "@/pages/api/issues/[id]/index";
import { POST as moveTeam } from "@/pages/api/issues/[id]/move-team";
import { GET as getIssue } from "@/pages/api/issues/[id]/index";
import { POST as addRelation } from "@/pages/api/issues/[id]/relations";
import { POST as bulkIssues } from "@/pages/api/issues/bulk";
import { POST as undo } from "@/pages/api/undo/[token]";
import { GET as listHistory } from "@/pages/api/issues/[id]/history";
import { GET as listDescVersions } from "@/pages/api/issues/[id]/description-versions";
import { POST as addComment } from "@/pages/api/issues/[id]/comments";
import { PATCH as patchComment } from "@/pages/api/comments/[id]/index";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = createApiDb();
});
afterEach(teardownApiDb);

async function env() {
  const res = await signup({
    request: apiReq("POST", "/auth/signup", { body: { email: "iss2@x.com", name: "Issuer", password: "longenough1" } }),
  });
  const cookie = cookieFor(sessionTokenFrom(res));
  const wsRes = await createWs({
    request: apiReq("POST", "/workspaces", { cookie, body: { name: "Issue Ws 2", slug: "issue-ws-2" }, test: true }),
  });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id as string, teamId: data.defaultTeamId as string, cookie };
}

function seedEngTeam(wsId: string, proTeamId: string): string {
  // POST /teams does not provision states; copy PRO workflow onto ENG for move-team tests.
  return sqlite.transaction(() => {
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO teams (id, workspace_id, key, name, position, created_at, updated_at)
         VALUES ('eng-team', ?, 'ENG', 'Eng', 'b', ?, ?)`,
      )
      .run(wsId, now, now);
    sqlite.prepare("INSERT INTO team_counters (team_id, next_number) VALUES ('eng-team', 1)").run();
    const states = sqlite.prepare("SELECT name, category, color, position FROM states WHERE team_id = ?").all(proTeamId) as Array<{
      name: string;
      category: string;
      color: string | null;
      position: string;
    }>;
    for (const [i, s] of states.entries()) {
      sqlite
        .prepare("INSERT INTO states (id, team_id, name, category, position, color) VALUES (?,?,?,?,?,?)")
        .run(`eng-st-${i}`, "eng-team", s.name, s.category, s.position, s.color);
    }
    return "eng-team";
  })();
}

describe("move-team + relations + bulk", () => {
  it("move-team allocates ENG-1 and old PRO-1 still resolves", async () => {
    const { wsId, teamId, cookie } = await env();
    seedEngTeam(wsId, teamId);
    await createIssue({
      request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Mover" }, test: true }),
    });
    const moved = await moveTeam({
      request: apiReq("POST", `/issues/PRO-1/move-team?wsId=${wsId}`, { cookie, body: { teamId: "eng-team" }, test: true }),
      params: { id: "PRO-1" },
    });
    expect(moved.status).toBe(200);
    expect((await bodyOf(moved)).issue.identifier).toBe("ENG-1");
    const viaOld = await getIssue({
      request: apiReq("GET", `/issues/PRO-1?wsId=${wsId}`, { cookie }),
      params: { id: "PRO-1" },
    });
    expect((await bodyOf(viaOld)).issue.identifier).toBe("ENG-1");
  });

  it("blocking writes inverse blocked_by; resolving blocker downgrades to related", async () => {
    const { wsId, teamId, cookie } = await env();
    const a = await bodyOf(
      await createIssue({
        request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Blocker" }, test: true }),
      }),
    );
    const b = await bodyOf(
      await createIssue({
        request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Blocked" }, test: true }),
      }),
    );
    const rel = await addRelation({
      request: apiReq("POST", `/issues/${a.issue.id}/relations?wsId=${wsId}`, {
        cookie,
        body: { relatedIssueId: b.issue.id, type: "blocking" },
        test: true,
      }),
      params: { id: a.issue.id },
    });
    expect(rel.status).toBe(201);
    const inverse = sqlite
      .prepare("SELECT type FROM issue_relations WHERE issue_id = ? AND related_issue_id = ?")
      .get(b.issue.id, a.issue.id) as { type: string };
    expect(inverse.type).toBe("blocked_by");

    const done = sqlite.prepare("SELECT id FROM states WHERE team_id = ? AND category = 'completed'").get(teamId) as { id: string };
    await patchIssue({
      request: apiReq("PATCH", `/issues/${a.issue.id}?wsId=${wsId}`, { cookie, body: { stateId: done.id }, test: true }),
      params: { id: a.issue.id },
    });
    const after = sqlite
      .prepare("SELECT type FROM issue_relations WHERE issue_id = ? AND related_issue_id = ?")
      .get(a.issue.id, b.issue.id) as { type: string };
    expect(after.type).toBe("related");
  });

  it("bulk priority + undo restores previous values", async () => {
    const { wsId, teamId, cookie } = await env();
    const created = await bodyOf(
      await createIssue({
        request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Bulk me" }, test: true }),
      }),
    );
    const bulk = await bulkIssues({
      request: apiReq("POST", `/issues/bulk?wsId=${wsId}`, {
        cookie,
        body: { ids: [created.issue.id], action: "priority", value: 4 },
        test: true,
      }),
    });
    expect(bulk.status).toBe(200);
    const token = (await bodyOf(bulk)).undoToken as string;
    expect((await bodyOf(await getIssue({ request: apiReq("GET", `/issues/${created.issue.id}?wsId=${wsId}`, { cookie }), params: { id: created.issue.id } }))).issue.priority).toBe(4);

    const undone = await undo({
      request: apiReq("POST", `/undo/${token}?wsId=${wsId}`, { cookie, test: true }),
      params: { token },
    });
    expect(undone.status).toBe(200);
    expect((await bodyOf(await getIssue({ request: apiReq("GET", `/issues/${created.issue.id}?wsId=${wsId}`, { cookie }), params: { id: created.issue.id } }))).issue.priority).toBe(0);

    const again = await undo({
      request: apiReq("POST", `/undo/${token}?wsId=${wsId}`, { cookie, test: true }),
      params: { token },
    });
    expect(again.status).toBe(409);
  });

  it("bulk move_team undo restores identifier and drops the redirect", async () => {
    const { wsId, teamId, cookie } = await env();
    seedEngTeam(wsId, teamId);
    const created = await bodyOf(
      await createIssue({
        request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Move me" }, test: true }),
      }),
    );
    const bulk = await bulkIssues({
      request: apiReq("POST", `/issues/bulk?wsId=${wsId}`, {
        cookie,
        body: { ids: [created.issue.id], action: "move_team", value: "eng-team" },
        test: true,
      }),
    });
    expect(bulk.status).toBe(200);
    const token = (await bodyOf(bulk)).undoToken as string;
    expect((await bodyOf(await getIssue({ request: apiReq("GET", `/issues/${created.issue.id}?wsId=${wsId}`, { cookie }), params: { id: created.issue.id } }))).issue.identifier).toBe("ENG-1");

    const undone = await undo({
      request: apiReq("POST", `/undo/${token}?wsId=${wsId}`, { cookie, test: true }),
      params: { token },
    });
    expect(undone.status).toBe(200);
    const restored = await bodyOf(
      await getIssue({ request: apiReq("GET", `/issues/${created.issue.id}?wsId=${wsId}`, { cookie }), params: { id: created.issue.id } }),
    );
    expect(restored.issue.identifier).toBe("PRO-1");
    const redirect = sqlite.prepare("SELECT old_identifier FROM issue_redirects WHERE issue_id = ?").get(created.issue.id);
    expect(redirect).toBeUndefined();
  });
});

describe("history, descriptions, comments", () => {
  it("folds edits within 3 minutes into a single created history row", async () => {
    const { wsId, teamId, cookie } = await env();
    await createIssue({
      request: apiReq("POST", `/issues?wsId=${wsId}`, {
        cookie,
        body: { teamId, title: "Fold", descriptionMd: "v1" },
        test: true,
      }),
    });
    await patchIssue({
      request: apiReq("PATCH", `/issues/PRO-1?wsId=${wsId}`, { cookie, body: { title: "Folded", descriptionMd: "v2" }, test: true }),
      params: { id: "PRO-1" },
    });
    const hist = await bodyOf(
      await listHistory({ request: apiReq("GET", `/issues/PRO-1/history?wsId=${wsId}`, { cookie }), params: { id: "PRO-1" } }),
    );
    expect(hist.data).toHaveLength(1);
    expect(hist.data[0].field).toBe("created");
    const versions = await bodyOf(
      await listDescVersions({
        request: apiReq("GET", `/issues/PRO-1/description-versions?wsId=${wsId}`, { cookie }),
        params: { id: "PRO-1" },
      }),
    );
    expect(versions.data).toHaveLength(1);
    expect(versions.data[0].bodyMd).toBe("v2");
  });

  it("comments parse mentions into mention rows", async () => {
    const { wsId, teamId, cookie } = await env();
    const user = sqlite.prepare("SELECT id FROM users WHERE email = ?").get("iss2@x.com") as { id: string };
    await createIssue({
      request: apiReq("POST", `/issues?wsId=${wsId}`, { cookie, body: { teamId, title: "Talk" }, test: true }),
    });
    const posted = await addComment({
      request: apiReq("POST", `/issues/PRO-1/comments?wsId=${wsId}`, {
        cookie,
        body: { bodyMd: `hey @${user.id} look` },
        test: true,
      }),
      params: { id: "PRO-1" },
    });
    expect(posted.status).toBe(201);
    const comment = (await bodyOf(posted)).comment;
    const mention = sqlite.prepare("SELECT target_user_id FROM mentions WHERE comment_id = ?").get(comment.id) as {
      target_user_id: string;
    };
    expect(mention.target_user_id).toBe(user.id);

    const resolved = await patchComment({
      request: apiReq("PATCH", `/comments/${comment.id}`, { cookie, body: { resolvedAt: Date.now() }, test: true }),
      params: { id: comment.id },
    });
    expect(resolved.status).toBe(200);
  });
});
