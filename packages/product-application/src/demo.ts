import type {
  AiConnection,
  MemoryCapsule,
  Owner,
  PrivacyReceipt,
  ProjectIntent,
} from "@handshake/product-core";
import type { ProductCommunitySnapshot } from "./store.js";
import type { DemoBootstrapResult } from "./types.js";
import { sha256, tokenDigest } from "./utils.js";

export const DEMO_COMMUNITY_ID = "portfolio-builders";

const LIN_TOKEN = "hs_demo_linran";
const CHEN_TOKEN = "hs_demo_chenmo";

export function createDemoSnapshot(now: Date): {
  readonly snapshot: ProductCommunitySnapshot;
  readonly result: DemoBootstrapResult;
} {
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const owners: [Owner, Owner] = [
    {
      id: "owner_demo_linran",
      communityId: DEMO_COMMUNITY_ID,
      displayName: "林然",
      contact: { kind: "email", value: "linran@demo.example.test" },
      status: "active",
      createdAt: issuedAt,
    },
    {
      id: "owner_demo_chenmo",
      communityId: DEMO_COMMUNITY_ID,
      displayName: "陈默",
      contact: { kind: "wechat", value: "chenmo-demo" },
      status: "active",
      createdAt: issuedAt,
    },
  ];
  const connections: [AiConnection, AiConnection] = [
    {
      id: "connection_demo_chatgpt",
      ownerId: owners[0].id,
      provider: "chatgpt",
      label: "ChatGPT · 合成演示连接",
      sourceMode: "demo",
      capabilities: ["capsule_import", "interactive_tool"],
      status: "active",
      isDemo: true,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    },
    {
      id: "connection_demo_kimi",
      ownerId: owners[1].id,
      provider: "kimi",
      label: "Kimi · 合成演示连接",
      sourceMode: "demo",
      capabilities: ["capsule_import", "interactive_tool"],
      status: "active",
      isDemo: true,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    },
  ];
  const capsules: [MemoryCapsule, MemoryCapsule] = [
    {
      id: "capsule_demo_linran",
      ownerId: owners[0].id,
      connectionId: connections[0].id,
      sourceProvider: "chatgpt",
      sourceMode: "demo",
      status: "published",
      purpose: "seven_day_portfolio_teamup",
      fields: {
        goal: "7 天完成一个可在求职面试中展示的 AI 求职助手",
        offers: ["产品设计", "用户研究", "PRD", "原型"],
        seeks: ["TypeScript", "Node.js", "LLM 集成", "部署"],
        availability: "工作日晚间，每周约 6 小时，周末可集中协作",
        collaborationStyles: ["异步优先", "每日简短同步", "先验证再扩展"],
        projectInterests: ["AI 求职", "个人效率", "开发者工具"],
        location: "远程",
        languages: ["中文"],
      },
      approvedFields: [
        "goal",
        "offers",
        "seeks",
        "availability",
        "collaborationStyles",
        "projectInterests",
        "location",
        "languages",
      ],
      privateCategories: ["raw_chat_history", "contact_details"],
      expiresAt,
    },
    {
      id: "capsule_demo_chenmo",
      ownerId: owners[1].id,
      connectionId: connections[1].id,
      sourceProvider: "kimi",
      sourceMode: "demo",
      status: "published",
      purpose: "seven_day_portfolio_teamup",
      fields: {
        goal: "用 7 天做出一个结构完整、能真实运行的 AI 产品",
        offers: ["TypeScript", "Node.js", "LLM 集成", "SQLite", "部署"],
        seeks: ["产品定义", "用户访谈", "PRD", "界面原型"],
        availability: "工作日晚间，每周约 8 小时，周末可集中协作",
        collaborationStyles: ["异步优先", "每日简短同步", "小步提交"],
        projectInterests: ["AI 求职", "开发者工具", "Agent"],
        location: "远程",
        languages: ["中文"],
      },
      approvedFields: [
        "goal",
        "offers",
        "seeks",
        "availability",
        "collaborationStyles",
        "projectInterests",
        "location",
        "languages",
      ],
      privateCategories: ["raw_chat_history", "contact_details"],
      expiresAt,
    },
  ];
  const intents: [ProjectIntent, ProjectIntent] = [
    {
      id: "intent_demo_linran",
      ownerId: owners[0].id,
      communityId: DEMO_COMMUNITY_ID,
      capsuleId: capsules[0].id,
      startsOn: issuedAt.slice(0, 10),
      title: "AI 求职助手",
      goal: "验证求职者能否用一份资料生成岗位匹配建议；交付可运行 Web Demo",
      projectInterests: ["AI 求职", "个人效率"],
      offers: ["产品设计", "用户研究", "PRD", "原型"],
      seeks: ["TypeScript", "Node.js", "LLM 集成"],
      availability: {
        weeklyHours: 6,
        timezone: "Asia/Shanghai",
        slots: ["weekday-evening", "weekend"],
      },
      minimumPartnerWeeklyHours: 4,
      collaborationStyles: ["异步优先", "每日简短同步"],
      locationMode: "remote",
      requiredLanguages: ["中文"],
      status: "active",
      createdAt: issuedAt,
      expiresAt,
    },
    {
      id: "intent_demo_chenmo",
      ownerId: owners[1].id,
      communityId: DEMO_COMMUNITY_ID,
      capsuleId: capsules[1].id,
      startsOn: issuedAt.slice(0, 10),
      title: "AI 求职助手",
      goal: "完成一个有真实用户流程的 Agent 产品；交付可运行 Web Demo",
      projectInterests: ["AI 求职", "开发者工具"],
      offers: ["TypeScript", "Node.js", "LLM 集成", "部署"],
      seeks: ["产品设计", "用户研究", "PRD"],
      availability: {
        weeklyHours: 8,
        timezone: "Asia/Shanghai",
        slots: ["weekday-evening", "weekend"],
      },
      minimumPartnerWeeklyHours: 4,
      collaborationStyles: ["异步优先", "每日简短同步"],
      locationMode: "remote",
      requiredLanguages: ["中文"],
      status: "active",
      createdAt: issuedAt,
      expiresAt,
    },
  ];
  const receipts: PrivacyReceipt[] = capsules.map((capsule) => ({
    id: `receipt_publish_${capsule.ownerId}`,
    ownerId: capsule.ownerId,
    handshakeId: null,
    kind: "capsule_publish",
    purpose: "seven_day_portfolio_teamup",
    recipientOwnerId: null,
    subjectDigest: `sha256:${sha256(capsule.fields)}`,
    consentVersion: null,
    issuedAt,
    expiresAt,
    revokedAt: null,
  }));
  const snapshot: ProductCommunitySnapshot = {
    schemaVersion: "product-community-0.1",
    communityId: DEMO_COMMUNITY_ID,
    version: 1,
    owners,
    ownerTokens: [
      { ownerId: owners[0].id, tokenDigest: tokenDigest(LIN_TOKEN), issuedAt, revokedAt: null },
      { ownerId: owners[1].id, tokenDigest: tokenDigest(CHEN_TOKEN), issuedAt, revokedAt: null },
    ],
    connections,
    capsules,
    intents,
    handshakes: [],
    receipts,
    projects: [],
  };
  return {
    snapshot,
    result: {
      communityId: DEMO_COMMUNITY_ID,
      owners: [
        { owner: owners[0], token: LIN_TOKEN },
        { owner: owners[1], token: CHEN_TOKEN },
      ],
    },
  };
}
