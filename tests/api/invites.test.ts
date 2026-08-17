/** Invite lifecycle tests: create → list → accept (incl. signup-with-token) → revoke. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listInvites, POST as createInvite } from "@/pages/api/workspaces/[id]/invites/index";
import { DELETE as revokeInvite } from "@/pages/api/workspaces/[id]/invites/[inviteId]/index";
import { POST as acceptInvite } from "@/pages/api/invites/accept";
import { GET as me } from "@/pages/api/auth/me";
import { POST as signup } from "@/pages/api/auth/signup";
import { POST as createWs } from "@/pages/api/workspaces/index";
import { apiReq, bodyOf, cookieFor, createApiDb, sessionTokenFrom, teardownApiDb } from "./helpers";

beforeEach(createApiDb);
afterEach(teardownApiDb);

async function ownerEnv(): Promise<{ wsId: string; ownerToken: string; teamId: string }> {
  const res = await signup({ request: apiReq("POST", "/auth/signup", { body: { email: "inv@x.com", name: "Inviter", password: "longenough1" } }) });
  const ownerToken = sessionTokenFrom(res);
  const wsRes = await createWs({ request: apiReq("POST", "/workspaces", { cookie: cookieFor(ownerToken), body: { name: "Invite Co", slug: "invite-co" }, test: true }) });
  const data = await bodyOf(wsRes);
  return { wsId: data.workspace.id, ownerToken, teamId: data.defaultTeamId };
}

describe("POST /api/workspaces/:id/invites", () => {
  it("creates an invite with a /join/<token> link and lists it", async () => {
    const { wsId, ownerToken } = await ownerEnv();
    const res = await createInvite({
      request: apiReq("POST", `/workspaces/${wsId}/invites`, { cookie: cookieFor(ownerToken), body: { email: "new@x.com", role: "member" }, test: true }),
      params: { id: wsId },
    });
    expect(res.status).toBe(201);
    const data = await bodyOf(res);
    expect(data.link).toMatch(/^\/join\/[\w-]{20,}$/);
    expect(data.token).toBeTruthy();

    const list = await listInvites({ request: apiReq("GET", `/workspaces/${wsId}/invites`, { cookie: cookieFor(ownerToken) }), params: { id: wsId } });
    const listData = await bodyOf(list);
    expect(listData.data).toHaveLength(1);
    expect(listData.data[0].email).toBe("new@x.com");
  });

  it("requires teamId for guest invites", async () => {
    const { wsId, ownerToken } = await ownerEnv();
    const res = await createInvite({
      request: apiReq("POST", `/workspaces/${wsId}/invites`, { cookie: cookieFor(ownerToken), body: { email: "g@x.com", role: "guest" }, test: true }),
      params: { id: wsId },
    });
    expect(res.status).toBe(400);
  });

  it("guest invite with teamId scopes a team_members row on accept", async () => {
    const { wsId, ownerToken, teamId } = await ownerEnv();
    const res = await createInvite({
      request: apiReq("POST", `/workspaces/${wsId}/invites`, { cookie: cookieFor(ownerToken), body: { email: "g@x.com", role: "guest", teamId }, test: true }),
      params: { id: wsId },
    });
    expect(res.status).toBe(201);
    const { token } = await bodyOf(res);

    const accept = await acceptInvite({ request: apiReq("POST", "/invites/accept", { body: { token, password: "longenough1" } }) });
    expect(accept.status).toBe(200);
    const memberToken = sessionTokenFrom(accept);
    const meRes = await me({ request: apiReq("GET", "/auth/me", { cookie: cookieFor(memberToken) }) });
    const meData = await bodyOf(meRes);
    expect(meData.workspaces[0].role).toBe("guest");
  });
});

describe("POST /api/invites/accept", () => {
  it("signup-with-token: creates the user, session, and membership", async () => {
    const { wsId, ownerToken } = await ownerEnv();
    const invite = await createInvite({
      request: apiReq("POST", `/workspaces/${wsId}/invites`, { cookie: cookieFor(ownerToken), body: { email: "joiner@x.com", role: "member" }, test: true }),
      params: { id: wsId },
    });
    const { token } = await bodyOf(invite);

    const accept = await acceptInvite({ request: apiReq("POST", "/invites/accept", { body: { token, name: "Joiner", password: "longenough1" } }) });
    expect(accept.status).toBe(200);
    const memberToken = sessionTokenFrom(accept);

    const meRes = await me({ request: apiReq("GET", "/auth/me", { cookie: cookieFor(memberToken) }) });
    const meData = await bodyOf(meRes);
    expect(meData.user.email).toBe("joiner@x.com");
    expect(meData.workspaces).toHaveLength(1);
    expect(meData.workspaces[0].slug).toBe("invite-co");
    expect(meData.workspaces[0].role).toBe("member");

    // Second accept with the same token: consumed → 404.
    const again = await acceptInvite({ request: apiReq("POST", "/invites/accept", { body: { token } }) });
    expect(again.status).toBe(404);
  });

  it("accepting while already a member (logged-in session) → 409", async () => {
    const { wsId, ownerToken } = await ownerEnv();
    const invite = await createInvite({
      request: apiReq("POST", `/workspaces/${wsId}/invites`, { cookie: cookieFor(ownerToken), body: { email: "fresh@x.com", role: "member" }, test: true }),
      params: { id: wsId },
    });
    const { token } = await bodyOf(invite);
    // Owner clicks the join link while logged in — already a member → 409.
    const accept = await acceptInvite({ request: apiReq("POST", "/invites/accept", { body: { token }, cookie: cookieFor(ownerToken), test: true }) });
    expect(accept.status).toBe(409);
    expect((await bodyOf(accept)).error.code).toBe("CONFLICT");
  });

  it("unknown token → 404", async () => {
    const res = await acceptInvite({ request: apiReq("POST", "/invites/accept", { body: { token: "definitely-not-a-real-token-abc" } }) });
    expect(res.status).toBe(404);
  });

  it("revoked invites cannot be accepted", async () => {
    const { wsId, ownerToken } = await ownerEnv();
    const invite = await createInvite({
      request: apiReq("POST", `/workspaces/${wsId}/invites`, { cookie: cookieFor(ownerToken), body: { email: "rev@x.com", role: "member" }, test: true }),
      params: { id: wsId },
    });
    const data = await bodyOf(invite);
    const revoke = await revokeInvite({
      request: apiReq("DELETE", `/workspaces/${wsId}/invites/${data.invite.id}`, { cookie: cookieFor(ownerToken), test: true }),
      params: { id: wsId, inviteId: data.invite.id },
    });
    expect(revoke.status).toBe(200);

    const accept = await acceptInvite({ request: apiReq("POST", "/invites/accept", { body: { token: data.token, password: "longenough1" } }) });
    expect(accept.status).toBe(404);
  });
});
