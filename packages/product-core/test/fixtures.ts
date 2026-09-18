import type {
  AiConnection,
  HandshakeDisclosureContent,
  MatchProfile,
  MemoryCapsule,
  Owner,
  PortfolioProject,
  PrivacyReceipt,
  ProductHandshake,
  ProjectIntent,
} from "../src/index.js";

export const NOW = "2026-09-17T08:00:00.000Z";
export const EXPIRES = "2026-10-17T08:00:00.000Z";

export function owner(id = "owner_alice", displayName = "Alice"): Owner {
  return {
    id,
    communityId: "portfolio-builders",
    displayName,
    contact: { kind: "email", value: `${id}@example.test` },
    status: "active",
    createdAt: NOW,
  };
}

export function connection(
  ownerId = "owner_alice",
  provider: AiConnection["provider"] = "chatgpt",
): AiConnection {
  return {
    id: `connection_${ownerId}`,
    ownerId,
    provider,
    label: `${provider} 常用 AI`,
    sourceMode: "mcp",
    capabilities: ["interactive_tool"],
    status: "active",
    isDemo: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function capsule(ownerId = "owner_alice", provider = "chatgpt"): MemoryCapsule {
  return {
    id: `capsule_${ownerId}`,
    ownerId,
    connectionId: `connection_${ownerId}`,
    sourceProvider: provider,
    sourceMode: "mcp",
    status: "draft",
    purpose: "seven_day_portfolio_teamup",
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
    expiresAt: EXPIRES,
  };
}

export function intent(ownerId = "owner_alice"): ProjectIntent {
  return {
    id: `intent_${ownerId}`,
    ownerId,
    communityId: "portfolio-builders",
    capsuleId: `capsule_${ownerId}`,
    startsOn: "2026-09-17",
    title: "AI 求职助手",
    goal: "7 天做出可演示作品",
    projectInterests: ["AI 求职"],
    offers: ["产品设计"],
    seeks: ["TypeScript"],
    availability: {
      weeklyHours: 6,
      timezone: "Asia/Shanghai",
      slots: ["weekday-evening", "weekend"],
    },
    minimumPartnerWeeklyHours: 4,
    collaborationStyles: ["异步优先"],
    locationMode: "remote",
    requiredLanguages: ["中文"],
    status: "active",
    createdAt: NOW,
    expiresAt: EXPIRES,
  };
}

export function profile(
  ownerId = "owner_alice",
  provider: AiConnection["provider"] = "chatgpt",
): MatchProfile {
  return {
    owner: owner(ownerId, ownerId === "owner_alice" ? "Alice" : "Bob"),
    connection: connection(ownerId, provider),
    capsule: { ...capsule(ownerId, provider), status: "published" },
    intent: intent(ownerId),
  };
}

export function disclosureContent(): HandshakeDisclosureContent {
  return {
    handshakeId: "handshake_demo",
    participantOwnerIds: ["owner_alice", "owner_bob"],
    capsules: [
      {
        ownerId: "owner_alice",
        capsuleId: "capsule_owner_alice",
        fields: { goal: "完成作品", offers: ["产品设计"], seeks: ["TypeScript"] },
      },
      {
        ownerId: "owner_bob",
        capsuleId: "capsule_owner_bob",
        fields: { goal: "完成作品", offers: ["TypeScript"], seeks: ["产品设计"] },
      },
    ],
    claims: [],
    recommendations: [],
  };
}

export function handshake(): ProductHandshake {
  return {
    id: "handshake_demo",
    communityId: "portfolio-builders",
    participantOwnerIds: ["owner_alice", "owner_bob"],
    status: "WAITING_DUAL_CONSENT",
    questions: [],
    claims: [],
    recommendations: [],
    decisions: [],
    disclosureContent: disclosureContent(),
    contactReveal: null,
    projectId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function receipt(): PrivacyReceipt {
  return {
    id: "receipt_demo",
    ownerId: "owner_alice",
    handshakeId: "handshake_demo",
    kind: "claim_disclosure",
    purpose: "seven_day_portfolio_teamup",
    recipientOwnerId: "owner_bob",
    subjectDigest: "sha256:abc",
    consentVersion: "consent_v1_abc",
    issuedAt: NOW,
    expiresAt: EXPIRES,
    revokedAt: null,
  };
}

export function project(): PortfolioProject {
  return {
    id: "project_demo",
    handshakeId: "handshake_demo",
    participantOwnerIds: ["owner_alice", "owner_bob"],
    title: "AI 求职助手",
    status: "active",
    startsAt: "2026-09-17",
    endsAt: "2026-09-23",
    plan: [],
    checkIns: [],
    artifacts: [],
    feedback: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}
