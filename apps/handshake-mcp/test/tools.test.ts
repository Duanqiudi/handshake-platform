import { describe, expect, it } from "vitest";
import type { JsonObject, MemberApiClient } from "../src/api-client.js";
import { HandshakeMcpRuntime } from "../src/mcp-runtime.js";
import { HandshakeToolRegistry } from "../src/tools.js";

interface RecordedRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: JsonObject;
}

class RecordingClient implements MemberApiClient {
  public readonly requests: RecordedRequest[] = [];
  public nextResponse: unknown = { ok: true };

  public async get(path: string): Promise<unknown> {
    this.requests.push({ method: "GET", path });
    return this.nextResponse;
  }

  public async post(path: string, body?: JsonObject): Promise<unknown> {
    this.requests.push({ method: "POST", path, ...(body === undefined ? {} : { body }) });
    return this.nextResponse;
  }
}

const capsuleInput = {
  connectionId: "connection_123",
  sourceProvider: "kimi",
  fields: {
    goal: "7 天完成一个 AI 求职助手",
    offers: ["产品设计", "用户研究"],
    seeks: ["TypeScript", "LLM 集成"],
    availability: "工作日晚间和周末 6 小时",
    collaborationStyles: ["异步优先", "每日简短同步"],
    projectInterests: ["AI 求职", "开发者工具"],
    location: "远程",
    languages: ["中文"],
  },
  approvedFields: ["goal", "offers", "seeks"],
  expiresAt: "2026-10-17T00:00:00.000Z",
};

describe("Handshake MCP tools", () => {
  it("registers exactly the nine contracted tools with closed schemas and warnings", () => {
    const registry = new HandshakeToolRegistry(new RecordingClient());
    const tools = registry.listTools();
    expect(tools.map(({ name }) => name)).toEqual([
      "prepare_memory_capsule",
      "publish_memory_capsule",
      "publish_project_intent",
      "list_candidates",
      "list_pending_questions",
      "submit_claim_response",
      "get_handshake_status",
      "submit_match_recommendation",
      "submit_owner_decision",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.description).toContain("完整 Memory");
      expect(tool.description).toContain("不会");
    }
  });

  it("maps every write tool to the documented member API body", async () => {
    const client = new RecordingClient();
    const registry = new HandshakeToolRegistry(client);

    await registry.callTool("prepare_memory_capsule", capsuleInput);
    await registry.callTool("publish_memory_capsule", {
      capsuleId: "capsule_123",
      ownerConfirmed: true,
    });
    await registry.callTool("publish_project_intent", {
      capsuleId: "capsule_123",
      title: "AI 求职助手",
      summary: "用真实用户问题验证求职工作流",
      desiredArtifact: "可点击演示和案例说明",
      startsOn: "2026-09-20",
      ownerConfirmed: true,
    });
    await registry.callTool("submit_claim_response", {
      handshakeId: "handshake_123",
      questionId: "question_123",
      answer: "未来七天每天可以异步更新一次。",
      ownerConfirmed: true,
      sourceType: "owner_confirmed",
      confidence: "high",
      expiresAt: "2026-09-27T00:00:00.000Z",
    });
    await registry.callTool("submit_match_recommendation", {
      handshakeId: "handshake_123",
      recommendation: "continue",
      summary: "技能互补且时间兼容。",
      reasons: ["一方提供产品设计，另一方提供 TypeScript"],
    });
    await registry.callTool("submit_owner_decision", {
      handshakeId: "handshake_123",
      decision: "continue",
      consentVersion: "consent_v1",
      ownerConfirmed: true,
    });

    expect(client.requests).toEqual([
      {
        method: "POST",
        path: "/v1/me/capsules/import",
        body: {
          connectionId: "connection_123",
          sourceProvider: "kimi",
          sourceMode: "mcp",
          purpose: "seven_day_portfolio_teamup",
          fields: capsuleInput.fields,
          approvedFields: ["goal", "offers", "seeks"],
          expiresAt: "2026-10-17T00:00:00.000Z",
        },
      },
      { method: "POST", path: "/v1/me/capsules/capsule_123/publish" },
      {
        method: "POST",
        path: "/v1/me/intents",
        body: {
          capsuleId: "capsule_123",
          title: "AI 求职助手",
          summary: "用真实用户问题验证求职工作流",
          desiredArtifact: "可点击演示和案例说明",
          startsOn: "2026-09-20",
        },
      },
      {
        method: "POST",
        path: "/v1/handshakes/handshake_123/questions/question_123/answer",
        body: {
          answer: "未来七天每天可以异步更新一次。",
          ownerConfirmed: true,
          sourceType: "owner_confirmed",
          confidence: "high",
          expiresAt: "2026-09-27T00:00:00.000Z",
        },
      },
      {
        method: "POST",
        path: "/v1/handshakes/handshake_123/recommendations",
        body: {
          recommendation: "continue",
          summary: "技能互补且时间兼容。",
          reasons: ["一方提供产品设计，另一方提供 TypeScript"],
        },
      },
      {
        method: "POST",
        path: "/v1/handshakes/handshake_123/decisions",
        body: { decision: "continue", consentVersion: "consent_v1" },
      },
    ]);
  });

  it("turns omitted field approval into an explicit empty list", async () => {
    const client = new RecordingClient();
    const registry = new HandshakeToolRegistry(client);
    const unapproved: Record<string, unknown> = structuredClone(capsuleInput);
    delete unapproved.approvedFields;

    await registry.callTool("prepare_memory_capsule", unapproved);

    expect(client.requests[0]?.body).toMatchObject({ approvedFields: [] });
  });

  it("maps read tools and returns only minimal pending-question fields", async () => {
    const client = new RecordingClient();
    const registry = new HandshakeToolRegistry(client);
    await registry.callTool("list_candidates", {});
    client.nextResponse = {
      handshakes: [
        {
          id: "handshake_123",
          pendingQuestions: [
            {
              id: "question_123",
              prompt: "未来七天每天能否异步更新？",
              predicate: "availability.daily_update",
              fromOwnerId: "owner_candidate",
              toOwnerId: "owner_current",
              expiresAt: "2026-09-24T00:00:00.000Z",
              required: true,
              internalNote: "must not leak",
            },
          ],
          contactReveal: { email: "must-not-leak@example.test" },
        },
      ],
    };
    await expect(registry.callTool("list_pending_questions", {})).resolves.toEqual({
      questions: [
        {
          handshakeId: "handshake_123",
          questionId: "question_123",
          prompt: "未来七天每天能否异步更新？",
          predicate: "availability.daily_update",
          fromOwnerId: "owner_candidate",
          toOwnerId: "owner_current",
          expiresAt: "2026-09-24T00:00:00.000Z",
          required: true,
        },
      ],
    });
    await registry.callTool("get_handshake_status", { handshakeId: "handshake_123" });
    expect(client.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "GET", path: "/v1/discovery/candidates" },
      { method: "GET", path: "/v1/handshakes" },
      { method: "GET", path: "/v1/handshakes/handshake_123/view" },
    ]);
  });

  it("rejects unknown fields, implicit owner decisions, and contact data before HTTP", async () => {
    const client = new RecordingClient();
    const registry = new HandshakeToolRegistry(client);
    await expect(registry.callTool("list_candidates", { unexpected: true })).rejects.toThrow(
      "$.unexpected is not allowed",
    );
    await expect(
      registry.callTool("submit_owner_decision", {
        handshakeId: "handshake_123",
        decision: "continue",
        consentVersion: "consent_v1",
        ownerConfirmed: false,
      }),
    ).rejects.toThrow("must equal true");
    await expect(
      registry.callTool("submit_claim_response", {
        handshakeId: "handshake_123",
        questionId: "question_123",
        answer: "联系邮箱是 person@example.com",
        ownerConfirmed: true,
      }),
    ).rejects.toThrow("Privacy boundary blocked");
    expect(client.requests).toEqual([]);
  });

  it("wraps tool results and errors in valid MCP call results", async () => {
    const client = new RecordingClient();
    client.nextResponse = { candidates: [{ ownerId: "owner_123" }] };
    const runtime = new HandshakeMcpRuntime(new HandshakeToolRegistry(client));
    const success = await runtime.callTool("list_candidates", {});
    expect(success).toMatchObject({
      structuredContent: { candidates: [{ ownerId: "owner_123" }] },
    });
    expect(success).not.toHaveProperty("isError");
    await expect(runtime.callTool("list_candidates", { extra: true })).resolves.toMatchObject({
      isError: true,
      structuredContent: {
        error: { code: "INVALID_TOOL_INPUT", retryable: false },
      },
    });
  });
});
