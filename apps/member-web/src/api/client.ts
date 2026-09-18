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
  Recommendation,
} from "./types";

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
  authenticated?: boolean;
}

export interface MemberApi {
  setToken(token: string | null): void;
  onboarding(input: {
    inviteCode: string;
    displayName: string;
    contactChannel: string;
    contactValue: string;
  }): Promise<OnboardingResult>;
  resetDemo(): Promise<DemoResetResult>;
  getDashboard(signal?: AbortSignal): Promise<DashboardData>;
  listConnections(signal?: AbortSignal): Promise<AiConnection[]>;
  createConnection(input: {
    provider: Provider;
    label: string;
    mode: "mcp" | "capsule_import" | "demo";
  }): Promise<AiConnection>;
  updateConnection(id: string, input: Partial<AiConnection>): Promise<AiConnection>;
  listCapsules(signal?: AbortSignal): Promise<MemoryCapsule[]>;
  importCapsule(input: {
    connectionId: string;
    sourceProvider: Provider;
    sourceMode?: "mcp" | "import" | "demo";
    purpose?: "seven_day_portfolio_teamup";
    fields: MemoryCapsule["fields"];
    approvedFields?: CapsuleFieldName[];
    expiresAt: string;
  }): Promise<MemoryCapsule>;
  updateCapsule(
    id: string,
    input: {
      fields: MemoryCapsule["fields"];
      approvedFields: CapsuleFieldName[];
      expiresAt: string;
    },
  ): Promise<MemoryCapsule>;
  publishCapsule(id: string): Promise<MemoryCapsule>;
  revokeCapsule(id: string): Promise<MemoryCapsule>;
  listIntents(signal?: AbortSignal): Promise<ProjectIntent[]>;
  createIntent(input: {
    capsuleId: string;
    title: string;
    summary: string;
    desiredArtifact: string;
    startsOn?: string;
  }): Promise<ProjectIntent>;
  pauseIntent(id: string): Promise<ProjectIntent>;
  listCandidates(signal?: AbortSignal): Promise<Candidate[]>;
  listHandshakes(signal?: AbortSignal): Promise<HandshakeView[]>;
  createHandshake(candidateOwnerId: string): Promise<HandshakeView>;
  getHandshake(id: string, signal?: AbortSignal): Promise<HandshakeView>;
  askQuestion(
    id: string,
    input: { toOwnerId: string; predicate: string; prompt: string; required?: boolean },
  ): Promise<HandshakeView>;
  answerQuestion(
    handshakeId: string,
    questionId: string,
    input: {
      answer: string;
      ownerConfirmed: true;
      sourceType?: string;
      confidence?: number;
      expiresAt?: string;
    },
  ): Promise<HandshakeView>;
  submitRecommendation(
    id: string,
    input: {
      recommendation: "continue" | "owner_review" | "decline";
      summary: string;
      reasons?: string[];
    },
  ): Promise<HandshakeView>;
  submitDecision(
    id: string,
    input: { decision: "continue" | "decline" | "more_info"; consentVersion: string },
  ): Promise<HandshakeView>;
  listProjects(signal?: AbortSignal): Promise<PortfolioProject[]>;
  getProject(id: string, signal?: AbortSignal): Promise<PortfolioProject>;
  addCheckIn(
    id: string,
    input: { day: number; summary: string; blocker?: string; nextStep: string },
  ): Promise<PortfolioProject>;
  addArtifact(id: string, input: { title: string; url: string }): Promise<PortfolioProject>;
  addFeedback(
    id: string,
    input: {
      completed: boolean;
      rating: number;
      wouldCollaborateAgain: boolean;
      comment?: string;
    },
  ): Promise<PortfolioProject>;
  listReceipts(signal?: AbortSignal): Promise<PrivacyReceipt[]>;
}

export class HttpMemberApi implements MemberApi {
  private token: string | null;
  private currentOwnerId: string | null = null;
  private readonly ownerNames = new Map<string, string>();

  public constructor(
    private readonly baseUrl = "/v1",
    token: string | null = null,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.token = token;
  }

  public setToken(token: string | null): void {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? true;
    if (authenticated && this.token === null) {
      throw new ApiError("请先使用邀请令牌登录。", 401, "TOKEN_REQUIRED", false);
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authenticated && this.token !== null) headers.Authorization = `Bearer ${this.token}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetcher.call(globalThis, `${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError("无法连接 Handshake 服务，请检查服务是否启动。", 0, "NETWORK_ERROR", true);
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const parsed = readApiError(payload);
      throw new ApiError(parsed.message, response.status, parsed.code, parsed.retryable);
    }
    return unwrap<T>(payload);
  }

  public onboarding(input: {
    inviteCode: string;
    displayName: string;
    contactChannel: string;
    contactValue: string;
  }): Promise<OnboardingResult> {
    return this.request<unknown>("/onboarding", {
      method: "POST",
      body: {
        displayName: input.displayName,
        contact: {
          kind: contactKind(input.contactChannel),
          value: input.contactValue,
        },
        inviteCode: input.inviteCode,
      },
      authenticated: false,
    }).then((value) => this.normalizeOnboarding(value));
  }

  public resetDemo(): Promise<DemoResetResult> {
    return this.request<unknown>("/demo/reset", { method: "POST", authenticated: false }).then(
      (value) => this.normalizeDemoReset(value),
    );
  }

  public getDashboard(signal?: AbortSignal): Promise<DashboardData> {
    return this.request<unknown>("/me/dashboard", withSignal(signal)).then((value) =>
      this.normalizeDashboard(value),
    );
  }

  public listConnections(signal?: AbortSignal): Promise<AiConnection[]> {
    return this.request<unknown>("/me/connections", withSignal(signal)).then((value) =>
      asArray(value).map(normalizeConnection),
    );
  }

  public createConnection(input: {
    provider: Provider;
    label: string;
    mode: "mcp" | "capsule_import" | "demo";
  }): Promise<AiConnection> {
    return this.request<unknown>("/me/connections", {
      method: "POST",
      body: { ...input, mode: input.mode === "capsule_import" ? "manual_import" : input.mode },
    }).then(normalizeConnection);
  }

  public updateConnection(id: string, input: Partial<AiConnection>): Promise<AiConnection> {
    return this.request<unknown>(`/me/connections/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }).then(normalizeConnection);
  }

  public listCapsules(signal?: AbortSignal): Promise<MemoryCapsule[]> {
    return this.request<unknown>("/me/capsules", withSignal(signal)).then((value) =>
      asArray(value).map(normalizeCapsule),
    );
  }

  public importCapsule(input: {
    connectionId: string;
    sourceProvider: Provider;
    sourceMode?: "mcp" | "import" | "demo";
    purpose?: "seven_day_portfolio_teamup";
    fields: MemoryCapsule["fields"];
    approvedFields?: CapsuleFieldName[];
    expiresAt: string;
  }): Promise<MemoryCapsule> {
    return this.request<unknown>("/me/capsules/import", { method: "POST", body: input }).then(
      normalizeCapsule,
    );
  }

  public updateCapsule(
    id: string,
    input: {
      fields: MemoryCapsule["fields"];
      approvedFields: CapsuleFieldName[];
      expiresAt: string;
    },
  ): Promise<MemoryCapsule> {
    return this.request<unknown>(`/me/capsules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }).then(normalizeCapsule);
  }

  public publishCapsule(id: string): Promise<MemoryCapsule> {
    return this.request<unknown>(`/me/capsules/${encodeURIComponent(id)}/publish`, {
      method: "POST",
    }).then(normalizeCapsule);
  }

  public revokeCapsule(id: string): Promise<MemoryCapsule> {
    return this.request<unknown>(`/me/capsules/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
    }).then(normalizeCapsule);
  }

  public listIntents(signal?: AbortSignal): Promise<ProjectIntent[]> {
    return this.request<unknown>("/me/intents", withSignal(signal)).then((value) =>
      asArray(value).map(normalizeIntent),
    );
  }

  public createIntent(input: {
    capsuleId: string;
    title: string;
    summary: string;
    desiredArtifact: string;
    startsOn?: string;
  }): Promise<ProjectIntent> {
    return this.request<unknown>("/me/intents", { method: "POST", body: input }).then(
      normalizeIntent,
    );
  }

  public pauseIntent(id: string): Promise<ProjectIntent> {
    return this.request<unknown>(`/me/intents/${encodeURIComponent(id)}/pause`, {
      method: "POST",
    }).then(normalizeIntent);
  }

  public listCandidates(signal?: AbortSignal): Promise<Candidate[]> {
    return this.request<unknown>("/discovery/candidates", withSignal(signal)).then((value) =>
      asArray(value).map(normalizeCandidate),
    );
  }

  public listHandshakes(signal?: AbortSignal): Promise<HandshakeView[]> {
    return this.request<unknown>("/handshakes", withSignal(signal)).then((value) =>
      asArray(value).map((item) => this.normalizeHandshake(item)),
    );
  }

  public createHandshake(candidateOwnerId: string): Promise<HandshakeView> {
    return this.request<unknown>("/handshakes", {
      method: "POST",
      body: { candidateOwnerId },
    }).then((value) => this.normalizeHandshake(value));
  }

  public getHandshake(id: string, signal?: AbortSignal): Promise<HandshakeView> {
    return this.request<unknown>(
      `/handshakes/${encodeURIComponent(id)}/view`,
      withSignal(signal),
    ).then((value) => this.normalizeHandshake(value));
  }

  public askQuestion(
    id: string,
    input: { toOwnerId: string; predicate: string; prompt: string; required?: boolean },
  ): Promise<HandshakeView> {
    return this.request<unknown>(`/handshakes/${encodeURIComponent(id)}/questions`, {
      method: "POST",
      body: input,
    }).then((value) => this.normalizeHandshake(value));
  }

  public answerQuestion(
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
    return this.request<unknown>(
      `/handshakes/${encodeURIComponent(handshakeId)}/questions/${encodeURIComponent(questionId)}/answer`,
      {
        method: "POST",
        body: {
          ...input,
          sourceType:
            input.sourceType === "owner_confirmed_ai_draft" ? "owner_confirmed" : input.sourceType,
          confidence:
            typeof input.confidence === "number"
              ? input.confidence >= 0.85
                ? "high"
                : input.confidence >= 0.55
                  ? "medium"
                  : "low"
              : input.confidence,
        },
      },
    ).then((value) => this.normalizeHandshake(value));
  }

  public submitRecommendation(
    id: string,
    input: {
      recommendation: "continue" | "owner_review" | "decline";
      summary: string;
      reasons?: string[];
    },
  ): Promise<HandshakeView> {
    return this.request<unknown>(`/handshakes/${encodeURIComponent(id)}/recommendations`, {
      method: "POST",
      body: input,
    }).then((value) => this.normalizeHandshake(value));
  }

  public submitDecision(
    id: string,
    input: { decision: "continue" | "decline" | "more_info"; consentVersion: string },
  ): Promise<HandshakeView> {
    return this.request<unknown>(`/handshakes/${encodeURIComponent(id)}/decisions`, {
      method: "POST",
      body: input,
    }).then((value) => this.normalizeHandshake(value));
  }

  public listProjects(signal?: AbortSignal): Promise<PortfolioProject[]> {
    return this.request<unknown>("/projects", withSignal(signal)).then((value) =>
      asArray(value).map((item) => this.normalizeProject(item)),
    );
  }

  public getProject(id: string, signal?: AbortSignal): Promise<PortfolioProject> {
    return this.request<unknown>(`/projects/${encodeURIComponent(id)}`, withSignal(signal)).then(
      (value) => this.normalizeProject(value),
    );
  }

  public addCheckIn(
    id: string,
    input: { day: number; summary: string; blocker?: string; nextStep: string },
  ): Promise<PortfolioProject> {
    return this.request<unknown>(`/projects/${encodeURIComponent(id)}/check-ins`, {
      method: "POST",
      body: input,
    }).then((value) => this.normalizeProject(value));
  }

  public addArtifact(id: string, input: { title: string; url: string }): Promise<PortfolioProject> {
    return this.request<unknown>(`/projects/${encodeURIComponent(id)}/artifacts`, {
      method: "POST",
      body: input,
    }).then((value) => this.normalizeProject(value));
  }

  public addFeedback(
    id: string,
    input: {
      completed: boolean;
      rating: number;
      wouldCollaborateAgain: boolean;
      comment?: string;
    },
  ): Promise<PortfolioProject> {
    return this.request<unknown>(`/projects/${encodeURIComponent(id)}/feedback`, {
      method: "POST",
      body: input,
    }).then((value) => this.normalizeProject(value));
  }

  public listReceipts(signal?: AbortSignal): Promise<PrivacyReceipt[]> {
    return this.request<unknown>("/privacy/receipts", withSignal(signal)).then((value) =>
      asArray(value).map(normalizeReceipt),
    );
  }

  private normalizeOnboarding(value: unknown): OnboardingResult {
    const source = record(value);
    const owner = normalizeOwner(source.owner);
    this.currentOwnerId = owner.id;
    this.ownerNames.set(owner.id, owner.displayName);
    return { owner, token: textValue(source.token) };
  }

  private normalizeDemoReset(value: unknown): DemoResetResult {
    const source = record(value);
    if (Array.isArray(source.owners)) {
      const demoOwners = source.owners.map((item) => this.normalizeOnboarding(item));
      const first = demoOwners[0];
      if (first === undefined)
        throw new ApiError("演示身份没有准备成功。", 500, "DEMO_EMPTY", false);
      return { ...first, demoOwners, message: "演示数据已恢复" };
    }
    return { ...this.normalizeOnboarding(source), message: optionalText(source.message) };
  }

  private normalizeDashboard(value: unknown): DashboardData {
    const source = record(value);
    const owner = normalizeOwner(source.owner);
    this.currentOwnerId = owner.id;
    this.ownerNames.set(owner.id, owner.displayName);
    const handshakes = asArray(source.handshakes).map((item) => this.normalizeHandshake(item));
    return {
      owner,
      connections: asArray(source.connections).map(normalizeConnection),
      capsules: asArray(source.capsules).map(normalizeCapsule),
      intents: asArray(source.intents).map(normalizeIntent),
      handshakes,
      projects: asArray(source.projects).map((item) => this.normalizeProject(item)),
      receipts: asArray(source.privacyReceipts ?? source.receipts).map(normalizeReceipt),
    };
  }

  private normalizeHandshake(value: unknown): HandshakeView {
    const source = record(value);
    const responseOwnerId = optionalText(source.currentOwnerId) ?? this.currentOwnerId;
    if (responseOwnerId !== null && responseOwnerId !== undefined) {
      this.currentOwnerId = responseOwnerId;
    }
    const participants = asArray(source.participants).map((item) => {
      const person = record(item);
      const ownerId = textValue(person.ownerId ?? person.id);
      const displayName = optionalText(person.displayName) ?? "项目伙伴";
      this.ownerNames.set(ownerId, displayName);
      return {
        ownerId,
        displayName,
        provider: providerValue(person.provider),
        isCurrentOwner: person.isCurrentOwner === true || ownerId === responseOwnerId,
      };
    });
    const rawStatus = optionalText(source.status) ?? "SCREENING";
    const timeline = asArray(source.timeline).map((item, index) => normalizeTimeline(item, index));
    const questions = asArray(source.pendingQuestions).map((item, index) => {
      const question = record(item);
      return {
        id: textValue(question.id),
        prompt: optionalText(question.prompt) ?? "对方希望确认一条项目信息",
        purpose: predicateLabel(optionalText(question.predicate)),
        round: Math.min(3, Math.max(1, numberValue(question.round, index + 1))),
        askedBy: textValue(question.fromOwnerId),
        status: "pending" as const,
        expiresAt: optionalText(question.expiresAt),
      };
    });
    const recommendations = asArray(source.recommendations).map((item) => {
      const recommendation = record(item);
      const reasons = stringArray(recommendation.reasons);
      const gaps = stringArray(recommendation.gaps);
      return {
        ownerId: textValue(recommendation.ownerId),
        recommendation: recommendationValue(recommendation.recommendation),
        summary: [...reasons, ...gaps].join("；") || "AI 已完成本轮判断。",
        reasons: [...reasons, ...gaps],
        createdAt: optionalText(recommendation.createdAt),
      };
    });
    const consentVersion = optionalText(source.consentVersion) ?? "consent-v1";
    const contactSource = source.contactReveal === null ? null : record(source.contactReveal);
    const contactReveal =
      contactSource === null
        ? null
        : {
            consentVersion,
            revealedAt: optionalText(contactSource.revealedAt) ?? new Date().toISOString(),
            contacts: asArray(contactSource.contacts).map((item) => {
              const contact = record(item);
              const ownerId = textValue(contact.ownerId);
              return {
                ownerId,
                displayName: this.ownerNames.get(ownerId) ?? "项目伙伴",
                channel: contactLabel(optionalText(contact.kind)),
                value: textValue(contact.value),
              };
            }),
          };
    return {
      id: textValue(source.id),
      status: normalizeStatus(rawStatus),
      statusLabel: optionalText(source.statusLabel) ?? statusLabel(rawStatus),
      participants,
      timeline,
      pendingQuestions: questions,
      recommendations,
      decisions: asArray(source.decisions).map((item) => {
        const decision = record(item);
        return {
          ownerId: textValue(decision.ownerId),
          decision: decision.decision === "continue" ? "continue" : "decline",
          consentVersion: optionalText(decision.consentVersion) ?? consentVersion,
          decidedAt: optionalText(decision.decidedAt) ?? new Date().toISOString(),
        };
      }),
      contactReveal,
      projectId: typeof source.projectId === "string" ? source.projectId : null,
      disclosureSummary: {
        version: consentVersion,
        items: [
          "仅交换双方登记的联系方式",
          "用途仅限本次 7 天项目协作",
          "双方基于同一版摘要分别确认",
        ],
      },
      roundsUsed: numberValue(
        source.roundsUsed,
        Math.min(3, Math.ceil(timeline.filter((item) => item.type === "question").length / 3)),
      ),
      maxRounds: numberValue(source.maxRounds, 3),
    };
  }

  private normalizeProject(value: unknown): PortfolioProject {
    const source = record(value);
    const checkIns = asArray(source.checkIns).map((item) => {
      const checkIn = record(item);
      return {
        id: textValue(checkIn.id),
        day: numberValue(checkIn.day, 1),
        ownerId: textValue(checkIn.ownerId),
        summary: optionalText(checkIn.summary) ?? "已完成今日更新",
        blocker: stringArray(checkIn.blockers).join("；") || undefined,
        nextStep: optionalText(checkIn.nextStep),
        createdAt: optionalText(checkIn.createdAt) ?? new Date().toISOString(),
      };
    });
    const ownerIds = stringArray(source.participantOwnerIds);
    const today = Math.min(7, Math.max(1, ...checkIns.map((item) => item.day), 1));
    return {
      id: textValue(source.id),
      handshakeId: textValue(source.handshakeId),
      title: optionalText(source.title) ?? "7 天作品集项目",
      status:
        source.status === "completed"
          ? "completed"
          : source.status === "cancelled"
            ? "archived"
            : "active",
      day: today,
      startsAt: optionalText(source.startsAt) ?? new Date().toISOString(),
      endsAt: optionalText(source.endsAt) ?? new Date().toISOString(),
      members: ownerIds.map((ownerId, index) => ({
        ownerId,
        displayName: this.ownerNames.get(ownerId) ?? (index === 0 ? "你" : "项目伙伴"),
        role: index === 0 ? "共同发起人" : "项目搭档",
      })),
      plan: asArray(source.plan).map((item) => {
        const day = record(item);
        const dayNumber = numberValue(day.day, 1);
        return {
          day: dayNumber,
          title: optionalText(day.title) ?? optionalText(day.objective) ?? `第 ${dayNumber} 天`,
          done: checkIns.some((entry) => entry.day === dayNumber),
        };
      }),
      checkIns,
      artifacts: asArray(source.artifacts).map((item) => {
        const artifact = record(item);
        return {
          id: textValue(artifact.id),
          title: optionalText(artifact.title) ?? "项目作品",
          url: textValue(artifact.url),
          createdAt: optionalText(artifact.createdAt) ?? new Date().toISOString(),
        };
      }),
      feedback: asArray(source.feedback).map((item) => {
        const feedback = record(item);
        const summary = optionalText(feedback.summary) ?? "已提交合作反馈";
        const rating = /评分\s*([1-5])\/5/.exec(summary)?.[1];
        return {
          id: textValue(feedback.id),
          ownerId: textValue(feedback.ownerId),
          rating: rating === undefined ? 5 : Number(rating),
          wouldCollaborateAgain: feedback.wouldCollaborateAgain === true,
          note: summary.replace(/；评分\s*[1-5]\/5/g, "").replace(/；(?:已完成|尚未完成)作品/g, ""),
          createdAt: optionalText(feedback.createdAt) ?? new Date().toISOString(),
        };
      }),
    };
  }
}

function withSignal(signal: AbortSignal | undefined): RequestOptions {
  return signal === undefined ? {} : { signal };
}

function unwrap<T>(payload: unknown): T {
  if (isRecord(payload) && "data" in payload) {
    const data = payload.data;
    if (isRecord(data)) {
      const keys = Object.keys(data);
      if (keys.length === 1) return data[keys[0] as keyof typeof data] as T;
    }
    return data as T;
  }
  return payload as T;
}

function normalizeOwner(value: unknown): OnboardingResult["owner"] {
  const source = record(value);
  return {
    id: textValue(source.id),
    displayName: optionalText(source.displayName) ?? "Handshake 成员",
    communityId: optionalText(source.communityId),
    contactHint: isRecord(source.contact)
      ? contactLabel(optionalText(source.contact.kind))
      : undefined,
  };
}

function normalizeConnection(value: unknown): AiConnection {
  const source = record(value);
  const sourceMode = optionalText(source.sourceMode ?? source.mode) ?? "import";
  return {
    id: textValue(source.id),
    provider: providerValue(source.provider),
    displayName: optionalText(source.displayName ?? source.label) ?? "我的 AI",
    mode: sourceMode === "mcp" ? "mcp" : sourceMode === "demo" ? "demo" : "capsule_import",
    status:
      source.status === "active" || source.status === "connected"
        ? "connected"
        : source.status === "disconnected"
          ? "disconnected"
          : "attention",
    capabilities: capabilities(source.capabilities),
    lastActiveAt: optionalText(source.updatedAt ?? source.lastActiveAt),
    isSynthetic: source.isDemo === true || source.isSynthetic === true,
  };
}

function normalizeCapsule(value: unknown): MemoryCapsule {
  const source = record(value);
  const rawStatus = optionalText(source.status) ?? "draft";
  return {
    id: textValue(source.id),
    ownerId: textValue(source.ownerId),
    connectionId: textValue(source.connectionId),
    sourceProvider: providerValue(source.sourceProvider),
    sourceMode:
      source.sourceMode === "mcp" ? "mcp" : source.sourceMode === "demo" ? "demo" : "import",
    status: rawStatus === "published" ? "published" : rawStatus === "revoked" ? "revoked" : "draft",
    purpose: "seven_day_portfolio_teamup",
    fields: normalizeFields(source.fields),
    approvedFields: capsuleFields(source.approvedFields),
    privateCategories: stringArray(source.privateCategories),
    expiresAt:
      optionalText(source.expiresAt) ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
    updatedAt: optionalText(source.updatedAt),
  };
}

function normalizeIntent(value: unknown): ProjectIntent {
  const source = record(value);
  const goal = optionalText(source.goal) ?? optionalText(source.summary) ?? "7 天作品集项目";
  const marker = "；目标交付：";
  const markerIndex = goal.indexOf(marker);
  return {
    id: textValue(source.id),
    capsuleId: optionalText(source.capsuleId),
    title: optionalText(source.title) ?? "7 天作品集项目",
    summary: markerIndex >= 0 ? goal.slice(0, markerIndex) : goal,
    desiredArtifact:
      markerIndex >= 0 ? goal.slice(markerIndex + marker.length) : "一个可以在面试中展示的作品",
    startsOn: optionalText(source.startsOn ?? source.createdAt),
    status: source.status === "paused" ? "paused" : "active",
    createdAt: optionalText(source.createdAt),
  };
}

function normalizeCandidate(value: unknown): Candidate {
  const source = record(value);
  const capsule = normalizeCapsule(source.capsule);
  return {
    ownerId: textValue(source.ownerId),
    displayName: optionalText(source.displayName) ?? "项目候选",
    provider: providerValue(source.provider),
    connectionMode:
      source.connectionMode === "mcp"
        ? "mcp"
        : source.connectionMode === "demo"
          ? "demo"
          : "capsule_import",
    capsule,
    recommendation: recommendationValue(source.recommendation),
    reasons: stringArray(source.reasons),
    gaps: [...stringArray(source.gaps), ...stringArray(source.conflicts)],
    matchedOffers: stringArray(source.matchedOffers),
    scheduleCompatible: source.scheduleCompatible !== false,
    headline: optionalText(source.headline),
    intentTitle: optionalText(source.intentTitle) ?? capsule.fields.goal,
  };
}

function normalizeTimeline(value: unknown, index: number): HandshakeView["timeline"][number] {
  const source = record(value);
  const kind = optionalText(source.kind ?? source.type) ?? "system";
  const type: HandshakeView["timeline"][number]["type"] =
    kind === "question"
      ? "question"
      : kind === "claim"
        ? "answer"
        : kind === "recommendation"
          ? "recommendation"
          : kind === "decision"
            ? "decision"
            : kind === "revealed"
              ? "revealed"
              : "created";
  return {
    id: optionalText(source.id) ?? `timeline_${index}`,
    type,
    title: optionalText(source.title) ?? "Handshake 更新",
    detail: optionalText(source.detail) ?? "状态已更新",
    actor: optionalText(source.ownerId ?? source.actor),
    createdAt: optionalText(source.createdAt) ?? new Date().toISOString(),
    status: optionalText(source.status),
  };
}

function normalizeReceipt(value: unknown): PrivacyReceipt {
  const source = record(value);
  const rawKind = optionalText(source.kind ?? source.type) ?? "claim_disclosure";
  const type: PrivacyReceipt["type"] =
    rawKind === "capsule_publish"
      ? "capsule_publish"
      : rawKind === "contact_reveal"
        ? "contact_reveal"
        : rawKind === "project_feedback"
          ? "project_feedback"
          : "claim_share";
  const revoked = source.revokedAt !== null && source.revokedAt !== undefined;
  const expiresAt = optionalText(source.expiresAt);
  const expired = expiresAt !== undefined && Date.parse(expiresAt) < Date.now();
  return {
    id: textValue(source.id),
    type,
    title: receiptTitle(type),
    purpose: "7 天作品集项目组队",
    recipient:
      optionalText(source.recipient) ??
      (source.recipientOwnerId === null ? "候选发现范围" : "指定项目伙伴"),
    fields:
      stringArray(source.fields).length > 0 ? stringArray(source.fields) : ["经批准的最小必要信息"],
    status: revoked ? "revoked" : expired ? "expired" : "active",
    createdAt: optionalText(source.issuedAt ?? source.createdAt) ?? new Date().toISOString(),
    expiresAt,
    revocable: false,
  };
}

function normalizeFields(value: unknown): MemoryCapsule["fields"] {
  const source = record(value);
  return {
    goal: optionalText(source.goal) ?? "",
    offers: stringArray(source.offers),
    seeks: stringArray(source.seeks),
    availability: optionalText(source.availability) ?? "",
    collaborationStyles: stringArray(source.collaborationStyles),
    projectInterests: stringArray(source.projectInterests),
    location: optionalText(source.location) ?? "",
    languages: stringArray(source.languages),
  };
}

function normalizeStatus(value: string): HandshakeView["status"] {
  if (value === "WAITING_OWNER") return "WAITING_OWNER";
  if (value === "CLARIFYING") return "CLARIFYING";
  if (value === "PROPOSAL") return "PROPOSAL";
  if (value === "WAITING_DUAL_CONSENT") return "WAITING_DUAL_CONSENT";
  if (value === "REVEALED" || value === "INTRODUCED" || value === "FEEDBACK_COMPLETE")
    return "REVEALED";
  if (["REJECTED", "DECLINED", "NO_MATCH", "CANCELLED", "POLICY_BLOCKED", "FAILED"].includes(value))
    return "DECLINED";
  if (value === "EXPIRED") return "EXPIRED";
  return "SCREENING";
}

function statusLabel(value: string): string {
  if (value === "WAITING_OWNER") return "等待对方主人确认回答";
  if (value === "CLARIFYING") return "双方正在补充关键信息";
  if (value === "PROPOSAL") return "AI 正在给出独立建议";
  if (value === "WAITING_DUAL_CONSENT") return "等待双方主人决定";
  if (["REVEALED", "INTRODUCED", "FEEDBACK_COMPLETE"].includes(value))
    return "双方已同意，联系方式已解锁";
  if (["REJECTED", "DECLINED", "NO_MATCH", "CANCELLED"].includes(value)) return "这次匹配已结束";
  return "双方 AI 正在做有限了解";
}

function recommendationValue(value: unknown): Recommendation {
  return value === "continue"
    ? "continue"
    : value === "conflict" || value === "decline"
      ? "conflict"
      : "needs_info";
}

function providerValue(value: unknown): Provider {
  return value === "chatgpt" || value === "kimi" || value === "doubao" ? value : "other";
}

function capabilities(value: unknown): AiConnection["capabilities"] {
  return stringArray(value).filter(
    (item): item is AiConnection["capabilities"][number] =>
      item === "capsule_import" || item === "interactive_tool" || item === "background_callback",
  );
}

function capsuleFields(value: unknown): CapsuleFieldName[] {
  const allowed: CapsuleFieldName[] = [
    "goal",
    "offers",
    "seeks",
    "availability",
    "collaborationStyles",
    "projectInterests",
    "location",
    "languages",
  ];
  const values = new Set(stringArray(value));
  return allowed.filter((item) => values.has(item));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function textValue(value: unknown): string {
  return optionalText(value) ?? "";
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function contactKind(value: string): "email" | "phone" | "wechat" {
  const normalized = value.toLowerCase();
  if (normalized.includes("mail") || value.includes("邮箱")) return "email";
  if (normalized.includes("phone") || value.includes("电话")) return "phone";
  return "wechat";
}

function contactLabel(value: string | undefined): string {
  if (value === "email") return "邮箱";
  if (value === "phone") return "电话";
  return "微信";
}

function predicateLabel(value: string | undefined): string {
  const labels: Record<string, string> = {
    goal: "确认项目目标",
    offers: "确认可提供的能力",
    seeks: "确认所需能力",
    availability: "确认协作时间",
    collaborationStyles: "确认协作方式",
    projectInterests: "确认项目兴趣",
    location: "确认协作地点",
    languages: "确认工作语言",
  };
  return labels[value ?? ""] ?? "确认本次项目的必要信息";
}

function receiptTitle(type: PrivacyReceipt["type"]): string {
  if (type === "capsule_publish") return "Capsule 字段公开授权";
  if (type === "contact_reveal") return "双方同意后的联系方式交换";
  if (type === "project_feedback") return "项目互评授权";
  return "主人确认后的回答披露";
}

function readApiError(payload: unknown): { message: string; code: string; retryable: boolean } {
  if (isRecord(payload) && isRecord(payload.error)) {
    return {
      message:
        typeof payload.error.message === "string"
          ? payload.error.message
          : "请求没有成功，请稍后再试。",
      code: typeof payload.error.code === "string" ? payload.error.code : "UNKNOWN_ERROR",
      retryable: payload.error.retryable === true,
    };
  }
  return { message: "请求没有成功，请稍后再试。", code: "UNKNOWN_ERROR", retryable: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
