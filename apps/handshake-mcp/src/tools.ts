import type { JsonObject, MemberApiClient } from "./api-client.js";
import { type JsonSchema, ToolInputError, validateToolInput } from "./json-schema.js";
import { enforceOutboundPrivacy } from "./privacy.js";

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
}

interface RegisteredTool extends ToolDescriptor {
  readonly privacyCheck?: boolean;
  execute(input: Record<string, unknown>): Promise<unknown>;
}

const PURPOSE = "seven_day_portfolio_teamup";
const PRIVACY_WARNING =
  "隐私边界：不得传递原始聊天、完整 Memory、密码/API Key、详细地址、证件、联系人，或当前 7 天作品集组队用途未请求的私密内容。宿主 AI 只能依据自己当前获准的上下文填写参数；本工具不会、也不能读取宿主 AI 的 Memory。";
const ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$";

const idSchema = (description: string): JsonSchema => ({
  type: "string",
  minLength: 3,
  maxLength: 128,
  pattern: ID_PATTERN,
  description,
});

const shortText = (description: string, maxLength = 240): JsonSchema => ({
  type: "string",
  minLength: 1,
  maxLength,
  description,
});

const stringList = (description: string, maxItems = 12): JsonSchema => ({
  type: "array",
  minItems: 1,
  maxItems,
  uniqueItems: true,
  items: shortText("单个条目。", 120),
  description,
});

const approvedFieldNames = [
  "goal",
  "offers",
  "seeks",
  "availability",
  "collaborationStyles",
  "projectInterests",
  "location",
  "languages",
] as const;

const emptyObjectSchema: JsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

export class HandshakeToolRegistry {
  readonly #tools: ReadonlyMap<string, RegisteredTool>;

  public constructor(client: MemberApiClient) {
    const tools = createTools(client);
    this.#tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  public listTools(): readonly ToolDescriptor[] {
    return [...this.#tools.values()].map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  public async callTool(name: string, input: unknown): Promise<unknown> {
    const tool = this.#tools.get(name);
    if (tool === undefined) throw new ToolInputError(`Unknown tool: ${name}`);
    validateToolInput(tool.inputSchema, input);
    if (tool.privacyCheck === true) enforceOutboundPrivacy(input);
    return tool.execute(input);
  }
}

function createTools(client: MemberApiClient): readonly RegisteredTool[] {
  return [
    {
      name: "prepare_memory_capsule",
      description: `创建一份任务专用 Memory Capsule 草稿。只发送结构化、最小必要字段；不会读取宿主 Memory。${PRIVACY_WARNING}`,
      privacyCheck: true,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["connectionId", "sourceProvider", "fields"],
        properties: {
          connectionId: idSchema("用户已在 Handshake 创建的 AI 连接 ID。"),
          sourceProvider: {
            type: "string",
            enum: ["chatgpt", "kimi", "doubao"],
            description: "当前宿主 AI 的供应商。",
          },
          fields: {
            type: "object",
            additionalProperties: false,
            required: [
              "goal",
              "offers",
              "seeks",
              "availability",
              "collaborationStyles",
              "projectInterests",
              "location",
              "languages",
            ],
            properties: {
              goal: shortText("本次 7 天组队目标，不是完整个人经历。", 500),
              offers: stringList("可为项目提供的技能。"),
              seeks: stringList("希望搭档补足的技能。"),
              availability: shortText("未来 7 天可投入时间。"),
              collaborationStyles: stringList("偏好的协作方式。", 8),
              projectInterests: stringList("希望制作的作品方向。", 10),
              location: shortText("仅填写城市、时区或“远程”，不得填写详细地址。", 80),
              languages: stringList("可协作语言。", 8),
            },
          },
          approvedFields: {
            type: "array",
            minItems: 1,
            maxItems: approvedFieldNames.length,
            uniqueItems: true,
            items: { type: "string", enum: approvedFieldNames },
            description: "仅列出主人已经逐字段检查并同意披露的字段；未确认时请省略。",
          },
          expiresAt: {
            type: "string",
            format: "date-time",
            description: "可选的 Capsule 到期时间。",
          },
        },
      },
      execute: async (input) =>
        client.post("/v1/me/capsules/import", {
          connectionId: input.connectionId,
          sourceProvider: input.sourceProvider,
          sourceMode: "mcp",
          purpose: PURPOSE,
          fields: input.fields,
          // Omission must never inherit a server-side "approve everything" default.
          approvedFields: input.approvedFields ?? [],
          ...optional(input, "expiresAt"),
        }),
    },
    {
      name: "publish_memory_capsule",
      description: `在主人检查 Capsule 和已批准字段后发布。只有主人在当前交互中明确确认时才能调用；AI 不得代替主人确认。${PRIVACY_WARNING}`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["capsuleId", "ownerConfirmed"],
        properties: {
          capsuleId: idSchema("要发布的 Capsule ID。"),
          ownerConfirmed: {
            type: "boolean",
            const: true,
            description: "主人已在当前交互中明确确认发布，必须为 true。",
          },
        },
      },
      execute: async (input) => client.post(`/v1/me/capsules/${encodeId(input.capsuleId)}/publish`),
    },
    {
      name: "publish_project_intent",
      description: `发布一个 7 天作品集项目意图。必须绑定已批准 Capsule，且内容只应包含本次组队所需信息。${PRIVACY_WARNING}`,
      privacyCheck: true,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["capsuleId", "title", "summary", "desiredArtifact", "ownerConfirmed"],
        properties: {
          capsuleId: idSchema("已批准并发布的 Capsule ID。"),
          title: shortText("项目意图标题。", 100),
          summary: shortText("项目范围与价值的简短说明。", 800),
          desiredArtifact: shortText("7 天后希望交付的可展示作品。", 300),
          startsOn: { type: "string", format: "date", description: "可选开始日期。" },
          ownerConfirmed: {
            type: "boolean",
            const: true,
            description: "主人已明确同意公开该项目意图，必须为 true。",
          },
        },
      },
      execute: async (input) =>
        client.post("/v1/me/intents", {
          capsuleId: input.capsuleId,
          title: input.title,
          summary: input.summary,
          desiredArtifact: input.desiredArtifact,
          ...optional(input, "startsOn"),
        }),
    },
    {
      name: "list_candidates",
      description: `列出与当前用户公开项目意图匹配的候选人以及可解释理由。只返回 Handshake 已获准披露的数据。${PRIVACY_WARNING}`,
      inputSchema: emptyObjectSchema,
      execute: async () => client.get("/v1/discovery/candidates"),
    },
    {
      name: "list_pending_questions",
      description: `列出等待当前主人回答的结构化问题。问题本身不授权 AI 披露 Memory；回答必须通过 submit_claim_response 单独确认。${PRIVACY_WARNING}`,
      inputSchema: emptyObjectSchema,
      execute: async () => pendingQuestions(await client.get("/v1/handshakes")),
    },
    {
      name: "submit_claim_response",
      description: `提交一个经过主人确认的最小 Claim 回答。不得粘贴原始对话或完整 Memory；只回答被问到的事实。${PRIVACY_WARNING}`,
      privacyCheck: true,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["handshakeId", "questionId", "answer", "ownerConfirmed"],
        properties: {
          handshakeId: idSchema("问题所属 Handshake ID。"),
          questionId: idSchema("待回答问题 ID。"),
          answer: shortText("仅包含该问题所需的最小回答。", 1_200),
          ownerConfirmed: {
            type: "boolean",
            const: true,
            description: "主人检查并允许发送此回答，必须为 true。",
          },
          sourceType: {
            type: "string",
            enum: ["owner_confirmed", "ai_inferred"],
            description: "回答来源；即便 AI 推断也仍需要主人确认。",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "回答置信度。",
          },
          expiresAt: {
            type: "string",
            format: "date-time",
            description: "该 Claim 的可选到期时间。",
          },
        },
      },
      execute: async (input) =>
        client.post(
          `/v1/handshakes/${encodeId(input.handshakeId)}/questions/${encodeId(input.questionId)}/answer`,
          {
            answer: input.answer,
            ownerConfirmed: true,
            ...optional(input, "sourceType"),
            ...optional(input, "confidence"),
            ...optional(input, "expiresAt"),
          },
        ),
    },
    {
      name: "get_handshake_status",
      description: `读取一个 Handshake 的当前阶段、时间线、待办和双方决策。联系方式是否返回完全由成员 API 的双重同意规则决定。${PRIVACY_WARNING}`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["handshakeId"],
        properties: { handshakeId: idSchema("要查询的 Handshake ID。") },
      },
      execute: async (input) => client.get(`/v1/handshakes/${encodeId(input.handshakeId)}/view`),
    },
    {
      name: "submit_match_recommendation",
      description: `提交宿主 AI 对匹配的建议；这不是主人最终决定。理由必须基于已经获准披露的资料。${PRIVACY_WARNING}`,
      privacyCheck: true,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["handshakeId", "recommendation", "summary"],
        properties: {
          handshakeId: idSchema("Handshake ID。"),
          recommendation: {
            type: "string",
            enum: ["continue", "owner_review", "decline"],
            description: "AI 建议，不代表主人决定。",
          },
          summary: shortText("简洁、可解释的建议摘要。", 500),
          reasons: stringList("支持建议的已披露理由。", 8),
        },
      },
      execute: async (input) =>
        client.post(`/v1/handshakes/${encodeId(input.handshakeId)}/recommendations`, {
          recommendation: input.recommendation,
          summary: input.summary,
          ...optional(input, "reasons"),
        }),
    },
    {
      name: "submit_owner_decision",
      description: `提交主人的最终选择。只有主人在当前交互中明确选择后才能调用；AI 建议不能自动转成主人决定。${PRIVACY_WARNING}`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["handshakeId", "decision", "consentVersion", "ownerConfirmed"],
        properties: {
          handshakeId: idSchema("Handshake ID。"),
          decision: {
            type: "string",
            enum: ["continue", "decline", "more_info"],
            description: "主人明确选择的决定。",
          },
          consentVersion: shortText("主人看到并决定所依据的披露摘要版本。", 128),
          ownerConfirmed: {
            type: "boolean",
            const: true,
            description: "主人已在当前交互中明确确认该决定，必须为 true。",
          },
        },
      },
      execute: async (input) =>
        client.post(`/v1/handshakes/${encodeId(input.handshakeId)}/decisions`, {
          decision: input.decision,
          consentVersion: input.consentVersion,
        }),
    },
  ];
}

function encodeId(value: unknown): string {
  if (typeof value !== "string") throw new ToolInputError("Expected a validated identifier.");
  return encodeURIComponent(value);
}

function optional(input: Record<string, unknown>, key: string): JsonObject {
  return Object.hasOwn(input, key) ? { [key]: input[key] } : {};
}

function pendingQuestions(value: unknown): JsonObject {
  const handshakes = handshakeList(value);
  const questions: JsonObject[] = [];
  for (const handshake of handshakes) {
    const handshakeId = stringProperty(handshake, "id") ?? stringProperty(handshake, "handshakeId");
    const pending = handshake.pendingQuestions;
    if (!Array.isArray(pending)) continue;
    for (const entry of pending) {
      if (!isRecord(entry)) continue;
      const questionId = stringProperty(entry, "id") ?? stringProperty(entry, "questionId");
      const prompt = stringProperty(entry, "prompt");
      if (handshakeId === undefined || questionId === undefined || prompt === undefined) continue;
      questions.push({
        handshakeId,
        questionId,
        prompt,
        ...copyString(entry, "predicate"),
        ...copyString(entry, "fromOwnerId"),
        ...copyString(entry, "toOwnerId"),
        ...copyString(entry, "expiresAt"),
        ...(typeof entry.required === "boolean" ? { required: entry.required } : {}),
      });
    }
  }
  return { questions };
}

function handshakeList(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.handshakes)) return value.handshakes.filter(isRecord);
  if (Array.isArray(value.items)) return value.items.filter(isRecord);
  return Object.hasOwn(value, "pendingQuestions") ? [value] : [];
}

function copyString(value: Record<string, unknown>, key: string): JsonObject {
  const item = stringProperty(value, key);
  return item === undefined ? {} : { [key]: item };
}

function stringProperty(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
