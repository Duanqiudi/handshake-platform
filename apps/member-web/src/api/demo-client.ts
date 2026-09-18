import { ApiError, type MemberApi } from "./client";
import type {
  AiConnection,
  Candidate,
  CapsuleFieldName,
  DashboardData,
  DemoResetResult,
  HandshakeView,
  MemoryCapsule,
  OnboardingResult,
  PortfolioProject,
  PrivacyReceipt,
  ProjectIntent,
  Provider,
} from "./types";

interface DemoState {
  owner: OnboardingResult["owner"];
  connections: AiConnection[];
  capsules: MemoryCapsule[];
  intents: ProjectIntent[];
  candidates: Candidate[];
  handshakes: HandshakeView[];
  projects: PortfolioProject[];
  receipts: PrivacyReceipt[];
}

const NOW = "2026-09-17T08:00:00.000Z";
const DEMO_TOKEN = "demo-owner-token";

export class DemoMemberApi implements MemberApi {
  private token: string | null = null;
  private state = seedState();
  private sequence = 20;

  public setToken(token: string | null): void {
    this.token = token;
  }

  public async onboarding(input: {
    inviteCode: string;
    displayName: string;
    contactChannel: string;
    contactValue: string;
  }): Promise<OnboardingResult> {
    await pause();
    if (input.inviteCode.trim().length < 4) throw validationError("请输入有效的邀请码。");
    this.state.owner = { ...this.state.owner, displayName: input.displayName.trim() || "林夏" };
    this.token = DEMO_TOKEN;
    return clone({ owner: this.state.owner, token: DEMO_TOKEN });
  }

  public async resetDemo(): Promise<DemoResetResult> {
    await pause();
    this.state = seedState();
    this.token = DEMO_TOKEN;
    return clone({ owner: this.state.owner, token: DEMO_TOKEN, message: "演示数据已恢复" });
  }

  public async getDashboard(signal?: AbortSignal): Promise<DashboardData> {
    await this.ready(signal);
    return clone({
      owner: this.state.owner,
      connections: this.state.connections,
      capsules: this.state.capsules,
      intents: this.state.intents,
      handshakes: this.state.handshakes,
      projects: this.state.projects,
      receipts: this.state.receipts,
    });
  }

  public async listConnections(signal?: AbortSignal): Promise<AiConnection[]> {
    await this.ready(signal);
    return clone(this.state.connections);
  }

  public async createConnection(input: {
    provider: Provider;
    label: string;
    mode: "mcp" | "capsule_import" | "demo";
  }): Promise<AiConnection> {
    await this.ready();
    const connection: AiConnection = {
      id: this.id("connection"),
      provider: input.provider,
      displayName: input.label,
      mode: input.mode,
      status: "connected",
      capabilities:
        input.mode === "mcp" ? ["capsule_import", "interactive_tool"] : ["capsule_import"],
      lastActiveAt: NOW,
      ...(input.mode === "demo" ? { isSynthetic: true } : {}),
    };
    this.state.connections.unshift(connection);
    return clone(connection);
  }

  public async updateConnection(id: string, input: Partial<AiConnection>): Promise<AiConnection> {
    await this.ready();
    const connection = required(
      this.state.connections.find((item) => item.id === id),
      "AI 连接不存在。",
    );
    Object.assign(connection, input);
    return clone(connection);
  }

  public async listCapsules(signal?: AbortSignal): Promise<MemoryCapsule[]> {
    await this.ready(signal);
    return clone(this.state.capsules);
  }

  public async importCapsule(input: {
    connectionId: string;
    sourceProvider: Provider;
    sourceMode?: "mcp" | "import" | "demo";
    purpose?: "seven_day_portfolio_teamup";
    fields: MemoryCapsule["fields"];
    approvedFields?: CapsuleFieldName[];
    expiresAt: string;
  }): Promise<MemoryCapsule> {
    await this.ready();
    required(
      this.state.connections.find((item) => item.id === input.connectionId),
      "请先连接一个 AI。",
    );
    const capsule: MemoryCapsule = {
      id: this.id("capsule"),
      ownerId: this.state.owner.id,
      connectionId: input.connectionId,
      sourceProvider: input.sourceProvider,
      sourceMode: input.sourceMode ?? "import",
      status: "draft",
      purpose: input.purpose ?? "seven_day_portfolio_teamup",
      fields: clone(input.fields),
      approvedFields: clone(input.approvedFields ?? []),
      privateCategories: ["raw_chat_history", "contact_details", "credentials"],
      expiresAt: input.expiresAt,
      updatedAt: NOW,
    };
    this.state.capsules.unshift(capsule);
    return clone(capsule);
  }

  public async updateCapsule(
    id: string,
    input: {
      fields: MemoryCapsule["fields"];
      approvedFields: CapsuleFieldName[];
      expiresAt: string;
    },
  ): Promise<MemoryCapsule> {
    await this.ready();
    const capsule = this.capsule(id);
    capsule.fields = clone(input.fields);
    capsule.approvedFields = clone(input.approvedFields);
    capsule.expiresAt = input.expiresAt;
    capsule.updatedAt = new Date().toISOString();
    return clone(capsule);
  }

  public async publishCapsule(id: string): Promise<MemoryCapsule> {
    await this.ready();
    const capsule = this.capsule(id);
    if (capsule.approvedFields.length === 0) throw validationError("请至少批准一个字段。");
    capsule.status = "published";
    this.state.receipts.unshift({
      id: this.id("receipt"),
      type: "capsule_publish",
      title: "发布项目搭档 Capsule",
      purpose: "寻找 7 天作品集项目搭档",
      recipient: "portfolio-builders 社区",
      fields: capsule.approvedFields.map((field) => fieldLabel(field)),
      status: "active",
      createdAt: new Date().toISOString(),
      expiresAt: capsule.expiresAt,
      revocable: true,
    });
    return clone(capsule);
  }

  public async revokeCapsule(id: string): Promise<MemoryCapsule> {
    await this.ready();
    const capsule = this.capsule(id);
    capsule.status = "revoked";
    return clone(capsule);
  }

  public async listIntents(signal?: AbortSignal): Promise<ProjectIntent[]> {
    await this.ready(signal);
    return clone(this.state.intents);
  }

  public async createIntent(input: {
    capsuleId: string;
    title: string;
    summary: string;
    desiredArtifact: string;
    startsOn?: string;
  }): Promise<ProjectIntent> {
    await this.ready();
    const capsule = this.capsule(input.capsuleId);
    if (capsule.status !== "published") throw validationError("请先发布 Capsule。");
    const intent: ProjectIntent = {
      id: this.id("intent"),
      capsuleId: input.capsuleId,
      title: input.title,
      summary: input.summary,
      desiredArtifact: input.desiredArtifact,
      ...(input.startsOn === undefined ? {} : { startsOn: input.startsOn }),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    this.state.intents.unshift(intent);
    return clone(intent);
  }

  public async pauseIntent(id: string): Promise<ProjectIntent> {
    await this.ready();
    const intent = required(
      this.state.intents.find((item) => item.id === id),
      "项目意图不存在。",
    );
    intent.status = "paused";
    return clone(intent);
  }

  public async listCandidates(signal?: AbortSignal): Promise<Candidate[]> {
    await this.ready(signal);
    return clone(this.state.candidates);
  }

  public async listHandshakes(signal?: AbortSignal): Promise<HandshakeView[]> {
    await this.ready(signal);
    return clone(this.state.handshakes);
  }

  public async createHandshake(candidateOwnerId: string): Promise<HandshakeView> {
    await this.ready();
    const existing = this.state.handshakes.find((item) =>
      item.participants.some((participant) => participant.ownerId === candidateOwnerId),
    );
    if (existing !== undefined) return clone(existing);
    const candidate = required(
      this.state.candidates.find((item) => item.ownerId === candidateOwnerId),
      "候选人不存在。",
    );
    const handshake: HandshakeView = {
      id: this.id("handshake"),
      status: "SCREENING",
      statusLabel: "双方 AI 正在了解",
      participants: [
        {
          ownerId: this.state.owner.id,
          displayName: this.state.owner.displayName,
          provider: "chatgpt",
          isCurrentOwner: true,
        },
        {
          ownerId: candidate.ownerId,
          displayName: candidate.displayName,
          provider: candidate.provider,
        },
      ],
      timeline: [
        {
          id: this.id("timeline"),
          type: "created",
          title: "Handshake 已建立",
          detail: "双方只看到这次项目所需的授权资料。",
          createdAt: new Date().toISOString(),
        },
      ],
      pendingQuestions: [],
      recommendations: [],
      decisions: [],
      contactReveal: null,
      projectId: null,
      disclosureSummary: {
        version: "consent-v1",
        items: ["项目目标与期望作品", "可投入时间", "技能与协作偏好"],
      },
      roundsUsed: 0,
      maxRounds: 3,
    };
    this.state.handshakes.unshift(handshake);
    return clone(handshake);
  }

  public async getHandshake(id: string, signal?: AbortSignal): Promise<HandshakeView> {
    await this.ready(signal);
    return clone(this.handshake(id));
  }

  public async askQuestion(
    id: string,
    input: { toOwnerId: string; predicate: string; prompt: string; required?: boolean },
  ): Promise<HandshakeView> {
    await this.ready();
    const handshake = this.handshake(id);
    if ((handshake.roundsUsed ?? 0) >= (handshake.maxRounds ?? 3))
      throw validationError("提问轮次已用完。");
    handshake.pendingQuestions.push({
      id: this.id("question"),
      prompt: input.prompt,
      purpose: input.predicate,
      round: (handshake.roundsUsed ?? 0) + 1,
      askedBy: this.state.owner.id,
      status: "pending",
    });
    handshake.roundsUsed = (handshake.roundsUsed ?? 0) + 1;
    handshake.timeline.unshift({
      id: this.id("timeline"),
      type: "question",
      title: "你的 AI 提出一个澄清问题",
      detail: input.prompt,
      actor: this.state.owner.displayName,
      createdAt: new Date().toISOString(),
    });
    return clone(handshake);
  }

  public async answerQuestion(
    handshakeId: string,
    questionId: string,
    input: {
      answer: string;
      ownerConfirmed: true;
      sourceType?: string;
      confidence?: number;
      expiresAt?: string;
    },
  ): Promise<HandshakeView> {
    await this.ready();
    const handshake = this.handshake(handshakeId);
    const question = required(
      handshake.pendingQuestions.find((item) => item.id === questionId),
      "问题不存在。",
    );
    question.status = "answered";
    question.answer = input.answer;
    handshake.timeline.unshift({
      id: this.id("timeline"),
      type: "answer",
      title: "你确认发送了最小回答",
      detail: input.answer,
      actor: this.state.owner.displayName,
      createdAt: new Date().toISOString(),
    });
    handshake.recommendations = [
      {
        ownerId: "owner_chen",
        recommendation: "continue",
        summary: "目标、技能和工作节奏互补，建议进入主人确认。",
        reasons: ["技术能力补齐", "7 天时间安排兼容"],
        createdAt: new Date().toISOString(),
      },
    ];
    handshake.status = "PROPOSAL";
    handshake.statusLabel = "AI 已给出搭档建议";
    this.state.receipts.unshift({
      id: this.id("receipt"),
      type: "claim_share",
      title: "回答协作时间问题",
      purpose: question.purpose,
      recipient: "陈默的 Kimi",
      fields: ["主人确认的回答"],
      status: "active",
      createdAt: new Date().toISOString(),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      revocable: true,
    });
    return clone(handshake);
  }

  public async submitRecommendation(
    id: string,
    input: {
      recommendation: "continue" | "owner_review" | "decline";
      summary: string;
      reasons?: string[];
    },
  ): Promise<HandshakeView> {
    await this.ready();
    const handshake = this.handshake(id);
    const mapped =
      input.recommendation === "owner_review"
        ? "needs_info"
        : input.recommendation === "decline"
          ? "conflict"
          : "continue";
    handshake.recommendations = handshake.recommendations.filter(
      (item) => item.ownerId !== this.state.owner.id,
    );
    handshake.recommendations.push({
      ownerId: this.state.owner.id,
      recommendation: mapped,
      summary: input.summary,
      reasons: clone(input.reasons ?? []),
      createdAt: new Date().toISOString(),
    });
    if (input.recommendation === "decline") {
      handshake.status = "DECLINED";
      handshake.statusLabel = "匹配已礼貌结束";
    } else if (input.recommendation === "continue") {
      handshake.status = "WAITING_DUAL_CONSENT";
      handshake.statusLabel = "等待双方主人确认";
      if (!handshake.decisions.some((item) => item.ownerId === "owner_chen")) {
        handshake.decisions.push({
          ownerId: "owner_chen",
          decision: "continue",
          consentVersion: handshake.disclosureSummary?.version ?? "consent-v1",
          decidedAt: new Date().toISOString(),
        });
      }
    }
    handshake.timeline.unshift({
      id: this.id("timeline"),
      type: "recommendation",
      title: "你的 AI 完成判断",
      detail: input.summary,
      createdAt: new Date().toISOString(),
    });
    return clone(handshake);
  }

  public async submitDecision(
    id: string,
    input: { decision: "continue" | "decline" | "more_info"; consentVersion: string },
  ): Promise<HandshakeView> {
    await this.ready();
    const handshake = this.handshake(id);
    if (input.decision === "more_info") {
      handshake.status = "SCREENING";
      handshake.statusLabel = "等待补充了解";
      return clone(handshake);
    }
    handshake.decisions = handshake.decisions.filter(
      (item) => item.ownerId !== this.state.owner.id,
    );
    handshake.decisions.push({
      ownerId: this.state.owner.id,
      decision: input.decision,
      consentVersion: input.consentVersion,
      decidedAt: new Date().toISOString(),
    });
    if (input.decision === "decline") {
      handshake.status = "DECLINED";
      handshake.statusLabel = "你已决定暂不联系";
      return clone(handshake);
    }
    const allContinue = handshake.participants.every((participant) =>
      handshake.decisions.some(
        (decision) =>
          decision.ownerId === participant.ownerId &&
          decision.decision === "continue" &&
          decision.consentVersion === input.consentVersion,
      ),
    );
    if (allContinue) this.reveal(handshake, input.consentVersion);
    return clone(handshake);
  }

  public async listProjects(signal?: AbortSignal): Promise<PortfolioProject[]> {
    await this.ready(signal);
    return clone(this.state.projects);
  }

  public async getProject(id: string, signal?: AbortSignal): Promise<PortfolioProject> {
    await this.ready(signal);
    return clone(this.project(id));
  }

  public async addCheckIn(
    id: string,
    input: { day: number; summary: string; blocker?: string; nextStep: string },
  ): Promise<PortfolioProject> {
    await this.ready();
    const project = this.project(id);
    project.checkIns.unshift({
      id: this.id("checkin"),
      day: input.day,
      ownerId: this.state.owner.id,
      summary: input.summary,
      ...(input.blocker === undefined || input.blocker.trim() === ""
        ? {}
        : { blocker: input.blocker }),
      nextStep: input.nextStep,
      createdAt: new Date().toISOString(),
    });
    project.day = Math.max(project.day, input.day);
    return clone(project);
  }

  public async addArtifact(
    id: string,
    input: { title: string; url: string },
  ): Promise<PortfolioProject> {
    await this.ready();
    const project = this.project(id);
    project.artifacts.unshift({
      id: this.id("artifact"),
      title: input.title,
      url: input.url,
      createdAt: new Date().toISOString(),
    });
    return clone(project);
  }

  public async addFeedback(
    id: string,
    input: { completed: boolean; rating: number; wouldCollaborateAgain: boolean; comment?: string },
  ): Promise<PortfolioProject> {
    await this.ready();
    const project = this.project(id);
    project.feedback.push({
      id: this.id("feedback"),
      ownerId: this.state.owner.id,
      rating: input.rating,
      wouldCollaborateAgain: input.wouldCollaborateAgain,
      note: input.comment ?? "",
      createdAt: new Date().toISOString(),
    });
    if (input.completed) project.status = "completed";
    return clone(project);
  }

  public async listReceipts(signal?: AbortSignal): Promise<PrivacyReceipt[]> {
    await this.ready(signal);
    return clone(this.state.receipts);
  }

  private async ready(signal?: AbortSignal): Promise<void> {
    if (this.token === null)
      throw new ApiError("演示会话已结束，请重新进入。", 401, "TOKEN_REQUIRED", false);
    await pause(signal);
  }

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_demo_${this.sequence}`;
  }

  private capsule(id: string): MemoryCapsule {
    return required(
      this.state.capsules.find((item) => item.id === id),
      "Capsule 不存在。",
    );
  }

  private handshake(id: string): HandshakeView {
    return required(
      this.state.handshakes.find((item) => item.id === id),
      "Handshake 不存在。",
    );
  }

  private project(id: string): PortfolioProject {
    return required(
      this.state.projects.find((item) => item.id === id),
      "项目空间不存在。",
    );
  }

  private reveal(handshake: HandshakeView, consentVersion: string): void {
    handshake.status = "REVEALED";
    handshake.statusLabel = "双方已同意联系";
    handshake.contactReveal = {
      consentVersion,
      revealedAt: new Date().toISOString(),
      contacts: [
        {
          ownerId: this.state.owner.id,
          displayName: this.state.owner.displayName,
          channel: "微信",
          value: "demo-linxia",
        },
        {
          ownerId: "owner_chen",
          displayName: "陈默",
          channel: "邮箱",
          value: "chen.mo@example.test",
        },
      ],
    };
    handshake.timeline.unshift({
      id: this.id("timeline"),
      type: "revealed",
      title: "联系方式已安全揭示",
      detail: "两位主人基于同一版摘要明确同意。",
      createdAt: new Date().toISOString(),
    });
    let project = this.state.projects.find((item) => item.handshakeId === handshake.id);
    if (project === undefined) {
      project = seedProject(this.id("project"), handshake.id);
      this.state.projects.unshift(project);
    }
    handshake.projectId = project.id;
    this.state.receipts.unshift({
      id: this.id("receipt"),
      type: "contact_reveal",
      title: "双方同意揭示联系方式",
      purpose: "开始 7 天作品集项目",
      recipient: "林夏与陈默",
      fields: ["微信（林夏）", "邮箱（陈默）"],
      status: "active",
      createdAt: new Date().toISOString(),
      revocable: false,
    });
  }
}

function seedState(): DemoState {
  const capsule: MemoryCapsule = {
    id: "capsule_demo_primary",
    ownerId: "owner_demo_me",
    connectionId: "connection_demo_chatgpt",
    sourceProvider: "chatgpt",
    sourceMode: "mcp",
    status: "published",
    purpose: "seven_day_portfolio_teamup",
    fields: {
      goal: "7 天内做出一个能在产品经理面试中演示的 AI 求职助手",
      offers: ["产品设计", "用户研究", "原型表达"],
      seeks: ["TypeScript", "LLM 集成", "前端实现"],
      availability: "工作日晚间，周末共 8 小时",
      collaborationStyles: ["异步优先", "每日 15 分钟同步", "先做可演示闭环"],
      projectInterests: ["AI 求职", "个人效率", "开发者工具"],
      location: "远程 / 上海时区",
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
    privateCategories: ["raw_chat_history", "contact_details", "credentials"],
    expiresAt: "2026-10-17T00:00:00.000Z",
    updatedAt: NOW,
  };
  return {
    owner: {
      id: "owner_demo_me",
      displayName: "林夏",
      avatarSeed: "LX",
      contactHint: "微信 · 双方同意后展示",
      communityId: "portfolio-builders",
    },
    connections: [
      {
        id: "connection_demo_chatgpt",
        provider: "chatgpt",
        displayName: "我的 ChatGPT",
        mode: "mcp",
        status: "connected",
        capabilities: ["capsule_import", "interactive_tool"],
        lastActiveAt: NOW,
        isSynthetic: true,
      },
    ],
    capsules: [capsule],
    intents: [
      {
        id: "intent_demo_primary",
        capsuleId: capsule.id,
        title: "AI 求职材料共创助手",
        summary: "把零散经历整理成岗位相关的作品集案例，并给出可解释建议。",
        desiredArtifact: "一个可在线演示的 Web Demo + 3 分钟讲解稿",
        startsOn: "2026-09-18",
        status: "active",
        createdAt: NOW,
      },
    ],
    candidates: [
      {
        ownerId: "owner_chen",
        displayName: "陈默",
        provider: "kimi",
        connectionMode: "mcp",
        capsule: {
          fields: {
            goal: "做一个真实可用的 AI 求职工具并补充作品集",
            offers: ["TypeScript", "LLM 集成", "前端实现"],
            seeks: ["产品设计", "用户研究"],
            availability: "工作日晚间及周六，共 10 小时",
            collaborationStyles: ["异步优先", "小步提交", "每日同步"],
            projectInterests: ["AI 求职", "开发者工具"],
            location: "远程",
            languages: ["中文", "英文文档"],
          },
        },
        recommendation: "continue",
        reasons: [
          "你需要的 TypeScript 和 LLM 集成正是对方可提供的能力",
          "双方都希望 7 天产出可演示作品",
          "时间段与异步协作方式兼容",
        ],
        gaps: ["尚未确认周日是否可以参加最终演示"],
        matchedOffers: ["TypeScript", "LLM 集成", "前端实现"],
        scheduleCompatible: true,
        headline: "全栈开发 · 擅长把 AI 想法做成可用产品",
        intentTitle: "AI 求职材料共创助手",
      },
      {
        ownerId: "owner_wen",
        displayName: "温然",
        provider: "doubao",
        connectionMode: "capsule_import",
        capsule: {
          fields: {
            goal: "完成一个数据叙事类作品",
            offers: ["数据分析", "可视化"],
            seeks: ["前端实现", "产品定位"],
            availability: "仅周末 4 小时",
            collaborationStyles: ["集中共创"],
            projectInterests: ["数据新闻", "教育科技"],
            location: "远程",
            languages: ["中文"],
          },
        },
        recommendation: "needs_info",
        reasons: ["具备数据可视化能力，可能强化作品表达"],
        gaps: ["项目方向不同", "可投入时间尚不匹配"],
        matchedOffers: ["数据可视化"],
        scheduleCompatible: false,
        headline: "数据分析 · 善于把复杂信息讲清楚",
        intentTitle: "求职市场数据故事",
      },
      {
        ownerId: "owner_gu",
        displayName: "顾一",
        provider: "chatgpt",
        connectionMode: "capsule_import",
        capsule: {},
        recommendation: "conflict",
        reasons: ["同为产品方向，核心能力重叠较高"],
        gaps: ["需要的开发能力暂时无人覆盖"],
        matchedOffers: ["用户研究"],
        scheduleCompatible: true,
        headline: "产品新人 · 正在转向 AI 产品",
        intentTitle: "AI 面试模拟器",
      },
    ],
    handshakes: [seedHandshake()],
    projects: [],
    receipts: [
      {
        id: "receipt_demo_capsule",
        type: "capsule_publish",
        title: "发布项目搭档 Capsule",
        purpose: "寻找 7 天作品集项目搭档",
        recipient: "portfolio-builders 社区",
        fields: [
          "目标",
          "我能提供",
          "我在寻找",
          "可投入时间",
          "协作偏好",
          "项目兴趣",
          "协作地点",
          "语言",
        ],
        status: "active",
        createdAt: NOW,
        expiresAt: "2026-10-17T00:00:00.000Z",
        revocable: true,
      },
    ],
  };
}

function seedHandshake(): HandshakeView {
  return {
    id: "handshake_demo_chen",
    status: "SCREENING",
    statusLabel: "有 1 个问题等你确认",
    participants: [
      { ownerId: "owner_demo_me", displayName: "林夏", provider: "chatgpt", isCurrentOwner: true },
      { ownerId: "owner_chen", displayName: "陈默", provider: "kimi" },
    ],
    timeline: [
      {
        id: "timeline_demo_question",
        type: "question",
        title: "陈默的 Kimi 提出一个问题",
        detail: "你能否在周日晚上参加 30 分钟的最终演示录制？",
        actor: "陈默的 Kimi",
        createdAt: "2026-09-17T08:03:00.000Z",
      },
      {
        id: "timeline_demo_created",
        type: "created",
        title: "Handshake 已建立",
        detail: "平台发现双方技能、方向与时间具有互补性。",
        createdAt: NOW,
      },
    ],
    pendingQuestions: [
      {
        id: "question_demo_sunday",
        prompt: "你能否在周日晚上参加 30 分钟的最终演示录制？",
        purpose: "确认最终交付的共同时间",
        round: 1,
        askedBy: "owner_chen",
        status: "pending",
        expiresAt: "2026-09-19T08:00:00.000Z",
      },
    ],
    recommendations: [],
    decisions: [],
    contactReveal: null,
    projectId: null,
    disclosureSummary: {
      version: "consent-v1",
      items: ["项目目标与期望作品", "可投入时间", "技能与协作偏好", "双方 AI 的匹配建议"],
    },
    roundsUsed: 1,
    maxRounds: 3,
  };
}

function seedProject(id: string, handshakeId: string): PortfolioProject {
  return {
    id,
    handshakeId,
    title: "AI 求职材料共创助手",
    status: "active",
    day: 1,
    startsAt: "2026-09-18T00:00:00.000Z",
    endsAt: "2026-09-24T23:59:59.000Z",
    members: [
      { ownerId: "owner_demo_me", displayName: "林夏", role: "产品与研究" },
      { ownerId: "owner_chen", displayName: "陈默", role: "开发与 AI 集成" },
    ],
    plan: [
      { day: 1, title: "确定用户问题与成功标准", done: false },
      { day: 2, title: "完成主流程原型", done: false },
      { day: 3, title: "接入模型并跑通输入输出", done: false },
      { day: 4, title: "完成可用界面", done: false },
      { day: 5, title: "找 3 位用户试用", done: false },
      { day: 6, title: "修正问题并准备案例材料", done: false },
      { day: 7, title: "录制演示并发布作品", done: false },
    ],
    checkIns: [],
    artifacts: [],
    feedback: [],
  };
}

function fieldLabel(field: CapsuleFieldName): string {
  const labels: Record<CapsuleFieldName, string> = {
    goal: "目标",
    offers: "我能提供",
    seeks: "我在寻找",
    availability: "可投入时间",
    collaborationStyles: "协作偏好",
    projectInterests: "项目兴趣",
    location: "协作地点",
    languages: "语言",
  };
  return labels[field];
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new ApiError(message, 404, "NOT_FOUND", false);
  return value;
}

function validationError(message: string): ApiError {
  return new ApiError(message, 422, "VALIDATION_ERROR", false);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function pause(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 140);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
