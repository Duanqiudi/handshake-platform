import { describe, expect, it, vi } from "vitest";
import { HttpMemberApi } from "./client";

function response(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HttpMemberApi product DTO adapter", () => {
  it("invokes browser fetch with the global receiver", async () => {
    const fetcher = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(response([]));
    }) as unknown as typeof fetch;
    const api = new HttpMemberApi("/v1", "hs_test", fetcher);

    await expect(api.listConnections()).resolves.toEqual([]);
  });

  it("uses the requester identity returned by a direct handshake response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "handshake_1",
        status: "WAITING_OWNER",
        statusLabel: "等待对方主人确认回答",
        currentOwnerId: "owner_b",
        participants: [
          { id: "owner_a", displayName: "林然", provider: "chatgpt", isCurrentOwner: false },
          { id: "owner_b", displayName: "陈默", provider: "kimi", isCurrentOwner: true },
        ],
        timeline: [],
        pendingQuestions: [],
        recommendations: [],
        decisions: [],
        roundsUsed: 1,
        maxRounds: 3,
        consentVersion: "consent_abc",
        contactReveal: null,
        projectId: null,
      }),
    );
    const api = new HttpMemberApi("/v1", "hs_test", fetcher);

    const handshake = await api.getHandshake("handshake_1");

    expect(handshake.status).toBe("WAITING_OWNER");
    expect(handshake.participants.find((item) => item.ownerId === "owner_b")?.isCurrentOwner).toBe(
      true,
    );
    expect(handshake.roundsUsed).toBe(1);
  });

  it("keeps contacts absent before dual consent", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "handshake_1",
        status: "WAITING_DUAL_CONSENT",
        statusLabel: "等待双方主人决定",
        participants: [
          { id: "owner_a", displayName: "林然", provider: "chatgpt", connectionMode: "mcp" },
          { id: "owner_b", displayName: "陈默", provider: "kimi", connectionMode: "mcp" },
        ],
        timeline: [],
        pendingQuestions: [],
        recommendations: [],
        decisions: [],
        consentVersion: "consent_abc",
        contactReveal: null,
        projectId: null,
      }),
    );
    const api = new HttpMemberApi("/v1", "hs_test", fetcher);

    const handshake = await api.getHandshake("handshake_1");

    expect(handshake.contactReveal).toBeNull();
    expect(JSON.stringify(handshake)).not.toContain("example.test");
    expect(fetcher).toHaveBeenCalledWith(
      "/v1/handshakes/handshake_1/view",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer hs_test" }),
      }),
    );
  });

  it("maps contacts only when the server returns a reveal", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "handshake_1",
        status: "INTRODUCED",
        statusLabel: "已经建立联系",
        participants: [
          { id: "owner_a", displayName: "林然", provider: "chatgpt", connectionMode: "mcp" },
          { id: "owner_b", displayName: "陈默", provider: "kimi", connectionMode: "mcp" },
        ],
        timeline: [],
        pendingQuestions: [],
        recommendations: [],
        decisions: [],
        consentVersion: "consent_abc",
        contactReveal: {
          revealedAt: "2026-09-17T08:00:00.000Z",
          contacts: [
            { ownerId: "owner_a", kind: "wechat", value: "demo-linran" },
            { ownerId: "owner_b", kind: "email", value: "chen.mo@example.test" },
          ],
        },
        projectId: "project_1",
      }),
    );
    const api = new HttpMemberApi("/v1", "hs_test", fetcher);

    const handshake = await api.getHandshake("handshake_1");

    expect(handshake.status).toBe("REVEALED");
    expect(handshake.contactReveal?.contacts).toEqual([
      expect.objectContaining({ displayName: "林然", channel: "微信", value: "demo-linran" }),
      expect.objectContaining({
        displayName: "陈默",
        channel: "邮箱",
        value: "chen.mo@example.test",
      }),
    ]);
  });

  it("adapts the real demo reset shape and preserves both identities", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        communityId: "portfolio-builders",
        owners: [
          {
            owner: { id: "owner_a", displayName: "林然", communityId: "portfolio-builders" },
            token: "hs_a",
          },
          {
            owner: { id: "owner_b", displayName: "陈默", communityId: "portfolio-builders" },
            token: "hs_b",
          },
        ],
      }),
    );
    const api = new HttpMemberApi("/v1", null, fetcher);

    const result = await api.resetDemo();

    expect(result.demoOwners?.map((item) => [item.owner.displayName, item.token])).toEqual([
      ["林然", "hs_a"],
      ["陈默", "hs_b"],
    ]);
  });
});
