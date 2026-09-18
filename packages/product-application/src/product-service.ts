import { createHandshake } from "@handshake/domain";
import {
  type AiConnection,
  type AiProvider,
  approveCapsule,
  CAPSULE_FIELD_NAMES,
  type Candidate,
  type CapsuleFieldName,
  type CapsuleFields,
  type Claim,
  type ConnectionSourceMode,
  type Consent,
  createConsentVersion,
  createSevenDayPlan,
  type MatchProfile,
  type MatchRecommendation,
  type MemoryCapsule,
  matchCandidate,
  minimizeCapsule,
  type Owner,
  type PortfolioProject,
  type PrivacyReceipt,
  type ProductHandshake,
  type ProductQuestion,
  type ProjectIntent,
  revealContacts,
  TEAMUP_PURPOSE,
  type ValidationResult,
  validateAiConnection,
  validateClaim,
  validateConsent,
  validateMemoryCapsule,
  validateOwner,
  validatePortfolioProject,
  validatePrivacyReceipt,
  validateProductHandshake,
  validateProductQuestion,
  validateProjectIntent,
} from "@handshake/product-core";
import { createDemoSnapshot, DEMO_COMMUNITY_ID } from "./demo.js";
import { ProductError } from "./errors.js";
import { createHandshakeView } from "./presentation.js";
import {
  emptyProductSnapshot,
  type ProductCommunitySnapshot,
  type ProductHandshakeRecord,
  type ProductStore,
} from "./store.js";
import type {
  AddArtifactInput,
  AddCheckInInput,
  AddFeedbackInput,
  AnswerQuestionInput,
  AskQuestionInput,
  CreateConnectionInput,
  CreateIntentInput,
  DashboardView,
  DemoBootstrapResult,
  ImportCapsuleInput,
  OnboardOwnerInput,
  OnboardOwnerResult,
  StartHandshakeInput,
  SubmitDecisionInput,
  SubmitRecommendationInput,
  UpdateCapsuleInput,
  UpdateConnectionInput,
} from "./types.js";
import {
  addDays,
  applyProtocolCommand,
  calendarDate,
  defaultRuntime,
  nonBlank,
  type ProductRuntime,
  sha256,
  tokenDigest,
} from "./utils.js";

export interface ProductApplicationServiceOptions {
  readonly store: ProductStore;
  readonly communityId?: string;
  readonly runtime?: ProductRuntime;
}

interface MutationResult<T> {
  readonly snapshot: ProductCommunitySnapshot;
  readonly result: T;
}

export class ProductApplicationService {
  readonly #store: ProductStore;
  readonly #communityId: string;
  readonly #runtime: ProductRuntime;

  public constructor(options: ProductApplicationServiceOptions) {
    this.#store = options.store;
    this.#communityId = options.communityId ?? DEMO_COMMUNITY_ID;
    this.#runtime = options.runtime ?? defaultRuntime();
  }

  public async resetDemo(): Promise<DemoBootstrapResult> {
    const demo = createDemoSnapshot(this.#runtime.now());
    if (demo.snapshot.communityId !== this.#communityId) {
      throw new ProductError(
        "INVALID_STATE",
        "Demo community does not match the configured community.",
        500,
      );
    }
    await this.#store.reset(demo.snapshot);
    return demo.result;
  }

  public async onboard(input: OnboardOwnerInput): Promise<OnboardOwnerResult> {
    const ownerId = this.#runtime.createId("owner");
    const token = this.#runtime.createToken();
    const issuedAt = this.#runtime.now().toISOString();
    const owner: Owner = {
      id: ownerId,
      communityId: this.#communityId,
      displayName: nonBlank(input.displayName, "displayName"),
      contact: {
        kind: input.contact.kind,
        value: nonBlank(input.contact.value, "contact.value"),
      },
      status: "active",
      createdAt: issuedAt,
    };
    assertValid(validateOwner(owner), "owner");
    return this.#mutate((snapshot) => ({
      snapshot: {
        ...snapshot,
        owners: [...snapshot.owners, owner],
        ownerTokens: [
          ...snapshot.ownerTokens,
          { ownerId, tokenDigest: tokenDigest(token), issuedAt, revokedAt: null },
        ],
      },
      result: { owner, token },
    }));
  }

  public async authenticate(token: string): Promise<Owner> {
    const normalized = nonBlank(token, "token");
    const snapshot = await this.#read();
    const digest = tokenDigest(normalized);
    const tokenRecord = snapshot.ownerTokens.find(
      (item) => item.tokenDigest === digest && item.revokedAt === null,
    );
    const owner = snapshot.owners.find(
      (item) => item.id === tokenRecord?.ownerId && item.status === "active",
    );
    if (owner === undefined) {
      throw new ProductError("AUTHENTICATION_REQUIRED", "Owner token is invalid.", 401);
    }
    return owner;
  }

  public async getDashboard(ownerId: string): Promise<DashboardView> {
    const snapshot = await this.#read();
    const now = this.#runtime.now();
    const owner = requireOwner(snapshot, ownerId);
    return {
      owner,
      connections: snapshot.connections.filter((item) => item.ownerId === ownerId),
      capsules: snapshot.capsules.filter((item) => item.ownerId === ownerId),
      intents: snapshot.intents.filter((item) => item.ownerId === ownerId),
      candidates: findCandidates(snapshot, ownerId, now),
      handshakes: snapshot.handshakes
        .filter((item) => item.product.participantOwnerIds.includes(ownerId))
        .map((item) => createHandshakeView(snapshot, item, ownerId)),
      projects: snapshot.projects.filter((item) => item.participantOwnerIds.includes(ownerId)),
      privacyReceipts: snapshot.receipts.filter((item) => item.ownerId === ownerId),
    };
  }

  public async listConnections(ownerId: string): Promise<readonly AiConnection[]> {
    const snapshot = await this.#read();
    requireOwner(snapshot, ownerId);
    return snapshot.connections.filter((item) => item.ownerId === ownerId);
  }

  public async createConnection(
    ownerId: string,
    input: CreateConnectionInput,
  ): Promise<AiConnection> {
    const createdAt = this.#runtime.now().toISOString();
    const provider = normalizeProvider(input.provider);
    const sourceMode = normalizeSourceMode(input.mode);
    const connection: AiConnection = {
      id: this.#runtime.createId("connection"),
      ownerId,
      provider,
      label: nonBlank(input.label, "label"),
      sourceMode,
      capabilities:
        sourceMode === "import" ? ["capsule_import"] : ["capsule_import", "interactive_tool"],
      status: "active",
      isDemo: sourceMode === "demo" || input.provider === "demo",
      createdAt,
      updatedAt: createdAt,
    };
    assertValid(validateAiConnection(connection), "connection");
    return this.#mutate((snapshot) => {
      requireOwner(snapshot, ownerId);
      return {
        snapshot: { ...snapshot, connections: [...snapshot.connections, connection] },
        result: connection,
      };
    });
  }

  public async listCapsules(ownerId: string): Promise<readonly MemoryCapsule[]> {
    const snapshot = await this.#read();
    requireOwner(snapshot, ownerId);
    return snapshot.capsules.filter((item) => item.ownerId === ownerId);
  }

  public async updateConnection(
    ownerId: string,
    connectionId: string,
    input: UpdateConnectionInput,
  ): Promise<AiConnection> {
    const updatedAt = this.#runtime.now().toISOString();
    return this.#mutate((snapshot) => {
      const connection = requireConnection(snapshot, ownerId, connectionId);
      const updated: AiConnection = {
        ...connection,
        ...(input.label === undefined ? {} : { label: nonBlank(input.label, "label") }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updatedAt,
      };
      assertValid(validateAiConnection(updated), "connection");
      return {
        snapshot: {
          ...snapshot,
          connections: snapshot.connections.map((item) =>
            item.id === connectionId ? updated : item,
          ),
        },
        result: updated,
      };
    });
  }

  public async importCapsule(ownerId: string, input: ImportCapsuleInput): Promise<MemoryCapsule> {
    const capsuleId = this.#runtime.createId("capsule");
    const now = this.#runtime.now();
    return this.#mutate((snapshot) => {
      requireOwner(snapshot, ownerId);
      const connection = requireConnection(snapshot, ownerId, input.connectionId);
      const approvedFields = normalizeApprovedFields(input.approvedFields, input.fields);
      const capsule: MemoryCapsule = {
        id: capsuleId,
        ownerId,
        connectionId: connection.id,
        sourceProvider: input.sourceProvider?.trim() || connection.provider,
        sourceMode: normalizeSourceMode(input.sourceMode ?? connection.sourceMode),
        status: "draft",
        purpose: input.purpose ?? TEAMUP_PURPOSE,
        fields: structuredClone(input.fields),
        approvedFields,
        privateCategories: ["raw_chat_history", "contact_details"],
        expiresAt: input.expiresAt ?? addDays(now, 30).toISOString(),
      };
      assertValid(validateMemoryCapsule(capsule), "capsule");
      return {
        snapshot: { ...snapshot, capsules: [...snapshot.capsules, capsule] },
        result: capsule,
      };
    });
  }

  public async updateCapsule(
    ownerId: string,
    capsuleId: string,
    input: UpdateCapsuleInput,
  ): Promise<MemoryCapsule> {
    return this.#mutate((snapshot) => {
      const capsule = requireCapsule(snapshot, ownerId, capsuleId);
      if (capsule.status !== "draft") {
        throw new ProductError("INVALID_STATE", "Only draft Capsules can be edited.", 409);
      }
      const fields = input.fields ?? capsule.fields;
      const updated: MemoryCapsule = {
        ...capsule,
        fields: structuredClone(fields),
        approvedFields: normalizeApprovedFields(input.approvedFields, fields),
        expiresAt: input.expiresAt ?? capsule.expiresAt,
      };
      assertValid(validateMemoryCapsule(updated), "capsule");
      return {
        snapshot: {
          ...snapshot,
          capsules: snapshot.capsules.map((item) => (item.id === capsuleId ? updated : item)),
        },
        result: updated,
      };
    });
  }

  public async publishCapsule(ownerId: string, capsuleId: string): Promise<MemoryCapsule> {
    const currentDate = this.#runtime.now();
    const now = currentDate.toISOString();
    const receiptId = this.#runtime.createId("receipt");
    return this.#mutate((snapshot) => {
      const capsule = requireCapsule(snapshot, ownerId, capsuleId);
      if (capsule.status !== "draft") {
        throw new ProductError("INVALID_STATE", "Only draft Capsules can be published.", 409);
      }
      if (Date.parse(capsule.expiresAt) <= currentDate.getTime()) {
        throw new ProductError("INVALID_STATE", "The Capsule expiry must be in the future.", 409);
      }
      const published = approveCapsule(capsule, capsule.approvedFields);
      const receipt = {
        id: receiptId,
        ownerId,
        handshakeId: null,
        kind: "capsule_publish" as const,
        purpose: TEAMUP_PURPOSE,
        recipientOwnerId: null,
        subjectDigest: `sha256:${sha256(published.fields)}`,
        consentVersion: null,
        issuedAt: now,
        expiresAt: published.expiresAt,
        revokedAt: null,
      };
      assertValid(validatePrivacyReceipt(receipt), "privacy receipt");
      return {
        snapshot: {
          ...snapshot,
          capsules: snapshot.capsules.map((item) =>
            item.id === capsuleId
              ? published
              : item.ownerId === ownerId && item.status === "published"
                ? { ...item, status: "revoked" as const }
                : item,
          ),
          receipts: [...snapshot.receipts, receipt],
        },
        result: published,
      };
    });
  }

  public async revokeCapsule(ownerId: string, capsuleId: string): Promise<MemoryCapsule> {
    const revokedAt = this.#runtime.now().toISOString();
    return this.#mutate((snapshot) => {
      const capsule = requireCapsule(snapshot, ownerId, capsuleId);
      if (capsule.status === "revoked") return { snapshot, result: capsule };
      const revoked: MemoryCapsule = { ...capsule, status: "revoked" };
      return {
        snapshot: {
          ...snapshot,
          capsules: snapshot.capsules.map((item) => (item.id === capsuleId ? revoked : item)),
          intents: snapshot.intents.map((item) =>
            item.capsuleId === capsuleId ? { ...item, status: "paused" as const } : item,
          ),
          receipts: snapshot.receipts.map((item) =>
            item.ownerId === ownerId && item.kind === "capsule_publish" && item.revokedAt === null
              ? { ...item, revokedAt }
              : item,
          ),
        },
        result: revoked,
      };
    });
  }

  public async listIntents(ownerId: string): Promise<readonly ProjectIntent[]> {
    const snapshot = await this.#read();
    requireOwner(snapshot, ownerId);
    return snapshot.intents.filter((item) => item.ownerId === ownerId);
  }

  public async createIntent(ownerId: string, input: CreateIntentInput): Promise<ProjectIntent> {
    const now = this.#runtime.now();
    const intentId = this.#runtime.createId("intent");
    return this.#mutate((snapshot) => {
      const capsule = requireCapsule(snapshot, ownerId, input.capsuleId);
      if (capsule.status !== "published") {
        throw new ProductError(
          "INVALID_STATE",
          "Publish the Capsule before creating an intent.",
          409,
        );
      }
      if (Date.parse(capsule.expiresAt) <= now.getTime()) {
        throw new ProductError("INVALID_STATE", "The published Capsule has expired.", 409);
      }
      const fields = minimizeCapsule(capsule).fields;
      const startsOn = normalizeStartDate(input.startsOn, now);
      const intent: ProjectIntent = {
        id: intentId,
        ownerId,
        communityId: this.#communityId,
        capsuleId: capsule.id,
        startsOn,
        title: nonBlank(input.title, "title"),
        goal: `${nonBlank(input.summary, "summary")}；目标交付：${nonBlank(input.desiredArtifact, "desiredArtifact")}`,
        projectInterests: fields.projectInterests ?? [],
        offers: fields.offers ?? [],
        seeks: fields.seeks ?? [],
        availability: {
          weeklyHours: input.weeklyHours ?? inferWeeklyHours(fields.availability),
          timezone: input.timezone?.trim() || "Asia/Shanghai",
          slots: input.slots === undefined ? inferSlots(fields.availability) : [...input.slots],
        },
        ...(input.minimumPartnerWeeklyHours === undefined
          ? {}
          : { minimumPartnerWeeklyHours: input.minimumPartnerWeeklyHours }),
        collaborationStyles: fields.collaborationStyles ?? [],
        locationMode: input.locationMode ?? "remote",
        ...(fields.location === undefined ? {} : { location: fields.location }),
        requiredLanguages: fields.languages ?? [],
        status: "active",
        createdAt: now.toISOString(),
        expiresAt: addDays(now, 30).toISOString(),
      };
      assertValid(validateProjectIntent(intent), "intent");
      return {
        snapshot: {
          ...snapshot,
          intents: [
            ...snapshot.intents.map((item) =>
              item.ownerId === ownerId && item.status === "active"
                ? { ...item, status: "paused" as const }
                : item,
            ),
            intent,
          ],
        },
        result: intent,
      };
    });
  }

  public async pauseIntent(ownerId: string, intentId: string): Promise<ProjectIntent> {
    return this.#mutate((snapshot) => {
      const intent = requireIntent(snapshot, ownerId, intentId);
      const paused: ProjectIntent = { ...intent, status: "paused" };
      return {
        snapshot: {
          ...snapshot,
          intents: snapshot.intents.map((item) => (item.id === intentId ? paused : item)),
        },
        result: paused,
      };
    });
  }

  public async listCandidates(ownerId: string): Promise<readonly Candidate[]> {
    const snapshot = await this.#read();
    requireOwner(snapshot, ownerId);
    return findCandidates(snapshot, ownerId, this.#runtime.now());
  }

  public async startHandshake(
    ownerId: string,
    input: StartHandshakeInput,
  ): Promise<ReturnType<typeof createHandshakeView>> {
    const handshakeId = this.#runtime.createId("handshake");
    const currentDate = this.#runtime.now();
    const now = currentDate.toISOString();
    const candidateOwnerId = nonBlank(input.candidateOwnerId, "candidateOwnerId");
    return this.#mutate((snapshot) => {
      if (ownerId === candidateOwnerId) {
        throw new ProductError("INVALID_INPUT", "You cannot match with yourself.", 400);
      }
      const existing = snapshot.handshakes.find(
        (item) =>
          item.product.participantOwnerIds.includes(ownerId) &&
          item.product.participantOwnerIds.includes(candidateOwnerId) &&
          !isFinishedHandshake(item.product.status),
      );
      if (existing !== undefined) {
        return { snapshot, result: createHandshakeView(snapshot, existing, ownerId) };
      }
      const self = buildProfile(snapshot, ownerId, currentDate);
      const candidateProfile = buildProfile(snapshot, candidateOwnerId, currentDate);
      const match = matchCandidate(self, candidateProfile);
      if (match.recommendation === "conflict") {
        throw new ProductError(
          "INVALID_STATE",
          "This candidate has an explicit hard conflict.",
          409,
          { conflicts: match.conflicts },
        );
      }
      let protocol = createHandshake({
        id: handshakeId,
        communityId: this.#communityId,
        scene: "seven_day_portfolio_teamup",
        purpose: TEAMUP_PURPOSE,
        participantIds: [self.connection.id, candidateProfile.connection.id],
        budgetLimits: {
          maxRounds: 3,
          maxQuestionsPerRound: 3,
          maxTokens: 6_000,
          maxCostMicros: 1_000_000,
        },
      });
      for (const status of [
        "READY",
        "DISCOVERING",
        "CANDIDATE_FOUND",
        "OWNER_AUTHORIZED",
        "SCREENING",
      ] as const) {
        protocol = applyProtocolCommand(
          protocol,
          { type: "ADVANCE", to: status },
          `start-${status}`,
        );
      }
      const product: ProductHandshake = {
        id: handshakeId,
        communityId: this.#communityId,
        participantOwnerIds: [ownerId, candidateOwnerId],
        status: protocol.status,
        questions: [],
        claims: [],
        recommendations: [],
        decisions: [],
        disclosureContent: {
          handshakeId,
          participantOwnerIds: [ownerId, candidateOwnerId],
          capsules: [
            {
              ownerId,
              capsuleId: self.capsule.id,
              fields: minimizeCapsule(self.capsule).fields,
            },
            {
              ownerId: candidateOwnerId,
              capsuleId: candidateProfile.capsule.id,
              fields: minimizeCapsule(candidateProfile.capsule).fields,
            },
          ],
          claims: [],
          recommendations: [],
        },
        contactReveal: null,
        projectId: null,
        createdAt: now,
        updatedAt: now,
      };
      assertValid(validateProductHandshake(product), "handshake");
      const record: ProductHandshakeRecord = {
        product,
        protocol,
        intentIds: [self.intent.id, candidateProfile.intent.id],
        match,
      };
      const next = { ...snapshot, handshakes: [...snapshot.handshakes, record] };
      return { snapshot: next, result: createHandshakeView(next, record, ownerId) };
    });
  }

  public async listHandshakes(
    ownerId: string,
  ): Promise<readonly ReturnType<typeof createHandshakeView>[]> {
    const snapshot = await this.#read();
    requireOwner(snapshot, ownerId);
    return snapshot.handshakes
      .filter((item) => item.product.participantOwnerIds.includes(ownerId))
      .map((item) => createHandshakeView(snapshot, item, ownerId));
  }

  public async getHandshakeView(
    ownerId: string,
    handshakeId: string,
  ): Promise<ReturnType<typeof createHandshakeView>> {
    const snapshot = await this.#read();
    const record = requireHandshake(snapshot, ownerId, handshakeId);
    return createHandshakeView(snapshot, record, ownerId);
  }

  public async askQuestion(
    ownerId: string,
    handshakeId: string,
    input: AskQuestionInput,
  ): Promise<ReturnType<typeof createHandshakeView>> {
    const questionId = this.#runtime.createId("question");
    const now = this.#runtime.now();
    return this.#mutate((snapshot) => {
      const record = requireHandshake(snapshot, ownerId, handshakeId);
      if (
        !record.product.participantOwnerIds.includes(input.toOwnerId) ||
        input.toOwnerId === ownerId
      ) {
        throw new ProductError("INVALID_INPUT", "Question recipient is not the partner.", 400);
      }
      const requestedField = toCapsuleField(input.predicate);
      const questionCount = record.product.questions.length;
      if (questionCount >= 9) {
        throw new ProductError(
          "INVALID_STATE",
          "The three-round question budget is exhausted.",
          409,
        );
      }
      const round = (Math.floor(questionCount / 3) + 1) as 1 | 2 | 3;
      const questionsInRound = record.product.questions.filter(
        (item) => item.round === round,
      ).length;
      if (questionsInRound >= 3) {
        throw new ProductError("INVALID_STATE", "This round already has three questions.", 409);
      }
      const question: ProductQuestion = {
        id: questionId,
        handshakeId,
        fromOwnerId: ownerId,
        toOwnerId: input.toOwnerId,
        round,
        prompt: nonBlank(input.prompt, "prompt"),
        requestedFields: [requestedField],
        required: input.required ?? false,
        purpose: TEAMUP_PURPOSE,
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt: addDays(now, 7).toISOString(),
      };
      assertValid(validateProductQuestion(question), "question");
      const targetConnection = connectionForOwner(snapshot, record, input.toOwnerId);
      const protocol = applyProtocolCommand(
        record.protocol,
        {
          type: "REQUEST_OWNER",
          participantId: targetConnection.id,
          questionId,
          reason: question.prompt,
        },
        `question-${questionId}`,
      );
      const product: ProductHandshake = {
        ...record.product,
        status: protocol.status,
        questions: [...record.product.questions, question],
        updatedAt: now.toISOString(),
      };
      assertValid(validateProductHandshake(product), "handshake");
      const updated = { ...record, protocol, product };
      const next = replaceHandshake(snapshot, updated);
      return { snapshot: next, result: createHandshakeView(next, updated, ownerId) };
    });
  }

  public async answerQuestion(
    ownerId: string,
    handshakeId: string,
    questionId: string,
    input: AnswerQuestionInput,
  ): Promise<ReturnType<typeof createHandshakeView>> {
    if (input.ownerConfirmed !== true) {
      throw new ProductError(
        "DISCLOSURE_NOT_AUTHORIZED",
        "The owner must confirm every answer before disclosure.",
        403,
      );
    }
    const claimId = this.#runtime.createId("claim");
    const receiptId = this.#runtime.createId("receipt");
    const now = this.#runtime.now();
    return this.#mutate((snapshot) => {
      const record = requireHandshake(snapshot, ownerId, handshakeId);
      const question = record.product.questions.find(
        (item) => item.id === questionId && item.toOwnerId === ownerId,
      );
      if (question === undefined) {
        throw new ProductError("QUESTION_NOT_FOUND", "Pending question was not found.", 404);
      }
      if (question.status !== "pending") {
        throw new ProductError("INVALID_STATE", "Question is no longer pending.", 409);
      }
      const sourceConnection = connectionForOwner(snapshot, record, ownerId);
      const recipientOwnerId = otherParticipant(record.product, ownerId);
      const claim: Claim = {
        id: claimId,
        handshakeId,
        questionId,
        ownerId,
        recipientOwnerId,
        sourceConnectionId: sourceConnection.id,
        predicate: question.requestedFields[0] ?? "goal",
        value: nonBlank(input.answer, "answer"),
        purpose: TEAMUP_PURPOSE,
        approvedByOwner: true,
        createdAt: now.toISOString(),
        expiresAt: input.expiresAt ?? addDays(now, 7).toISOString(),
      };
      assertValid(validateClaim(claim), "claim");
      const protocol = applyProtocolCommand(
        record.protocol,
        {
          type: "RESOLVE_OWNER_REQUEST",
          participantId: sourceConnection.id,
          questionId,
          resolution: "ANSWERED",
        },
        `answer-${questionId}`,
      );
      const product: ProductHandshake = {
        ...record.product,
        status: protocol.status,
        questions: record.product.questions.map((item) =>
          item.id === questionId ? { ...item, status: "answered" as const } : item,
        ),
        claims: [...record.product.claims, claim],
        disclosureContent: {
          ...record.product.disclosureContent,
          claims: [
            ...record.product.disclosureContent.claims,
            {
              id: claim.id,
              ownerId: claim.ownerId,
              recipientOwnerId: claim.recipientOwnerId,
              predicate: claim.predicate,
              value: claim.value,
            },
          ],
        },
        updatedAt: now.toISOString(),
      };
      assertValid(validateProductHandshake(product), "handshake");
      const receipt: PrivacyReceipt = {
        id: receiptId,
        ownerId,
        handshakeId,
        kind: "claim_disclosure",
        purpose: TEAMUP_PURPOSE,
        recipientOwnerId,
        subjectDigest: `sha256:${sha256(claim)}`,
        consentVersion: `claim_v1_${sha256({ questionId, claimId, ownerId })}`,
        issuedAt: now.toISOString(),
        expiresAt: claim.expiresAt,
        revokedAt: null,
      };
      assertValid(validatePrivacyReceipt(receipt), "privacy receipt");
      const updated = { ...record, protocol, product };
      const next = {
        ...replaceHandshake(snapshot, updated),
        receipts: [...snapshot.receipts, receipt],
      };
      return { snapshot: next, result: createHandshakeView(next, updated, ownerId) };
    });
  }

  public async submitRecommendation(
    ownerId: string,
    handshakeId: string,
    input: SubmitRecommendationInput,
  ): Promise<ReturnType<typeof createHandshakeView>> {
    const now = this.#runtime.now().toISOString();
    return this.#mutate((snapshot) => {
      const record = requireHandshake(snapshot, ownerId, handshakeId);
      const connection = connectionForOwner(snapshot, record, ownerId);
      const normalized = normalizeRecommendation(input.recommendation);
      const reasons = [nonBlank(input.summary, "summary"), ...(input.reasons ?? [])];
      const recommendation: MatchRecommendation = {
        ownerId,
        connectionId: connection.id,
        recommendation: normalized,
        reasons: [...new Set(reasons.map((item) => item.trim()).filter(Boolean))],
        gaps: normalized === "needs_info" ? [input.summary.trim()] : [],
        createdAt: now,
      };
      const existing = record.product.recommendations.some((item) => item.ownerId === ownerId);
      const recommendations = [
        ...record.product.recommendations.filter((item) => item.ownerId !== ownerId),
        recommendation,
      ];
      const protocol = existing
        ? record.protocol
        : applyProtocolCommand(
            record.protocol,
            { type: "SUBMIT_PROPOSAL", participantId: connection.id },
            `proposal-${ownerId}`,
          );
      const product: ProductHandshake = {
        ...record.product,
        status: protocol.status,
        recommendations,
        disclosureContent: {
          ...record.product.disclosureContent,
          recommendations: recommendations.map((item) => ({
            ownerId: item.ownerId,
            recommendation: item.recommendation,
            reasons: item.reasons,
            gaps: item.gaps,
          })),
        },
        updatedAt: now,
      };
      assertValid(validateProductHandshake(product), "handshake");
      const updated = { ...record, protocol, product };
      const next = replaceHandshake(snapshot, updated);
      return { snapshot: next, result: createHandshakeView(next, updated, ownerId) };
    });
  }

  public async submitDecision(
    ownerId: string,
    handshakeId: string,
    input: SubmitDecisionInput,
  ): Promise<ReturnType<typeof createHandshakeView>> {
    const now = this.#runtime.now();
    const projectId = this.#runtime.createId("project");
    const receiptIds = [
      this.#runtime.createId("receipt"),
      this.#runtime.createId("receipt"),
    ] as const;
    return this.#mutate((snapshot) => {
      const record = requireHandshake(snapshot, ownerId, handshakeId);
      const expectedConsentVersion = createConsentVersion(record.product.disclosureContent);
      if (input.consentVersion !== expectedConsentVersion) {
        throw new ProductError(
          "CONFLICT",
          "The disclosure content changed. Review the latest version before deciding.",
          409,
          { expectedConsentVersion },
        );
      }
      const decision = normalizeDecision(input.decision);
      const consent: Consent = {
        ownerId,
        decision,
        consentVersion: expectedConsentVersion,
        decidedAt: now.toISOString(),
      };
      assertValid(validateConsent(consent), "consent");
      const connection = connectionForOwner(snapshot, record, ownerId);
      let protocol = applyProtocolCommand(
        record.protocol,
        {
          type: "SUBMIT_CONSENT",
          participantId: connection.id,
          decision:
            decision === "continue" ? "CONTINUE" : decision === "decline" ? "DECLINE" : "MORE_INFO",
          consentVersion: expectedConsentVersion,
        },
        `consent-${ownerId}-${record.protocol.consentCycle}`,
      );
      let product: ProductHandshake = {
        ...record.product,
        status: protocol.status,
        decisions: [
          ...record.product.decisions.filter((item) => item.ownerId !== ownerId),
          consent,
        ],
        updatedAt: now.toISOString(),
      };
      let projects = snapshot.projects;
      let receipts = snapshot.receipts;

      if (protocol.status === "CLARIFYING") {
        product = {
          ...product,
          recommendations: [],
          decisions: [],
          disclosureContent: { ...product.disclosureContent, recommendations: [] },
        };
      }

      if (protocol.status === "REVEALED") {
        const contacts = product.participantOwnerIds.map((participantOwnerId) => {
          const participant = requireOwner(snapshot, participantOwnerId);
          return { ownerId: participant.id, ...participant.contact };
        }) as [
          { ownerId: string; kind: "email" | "phone" | "wechat"; value: string },
          { ownerId: string; kind: "email" | "phone" | "wechat"; value: string },
        ];
        product = revealContacts(product, contacts, now.toISOString());
        const startDate = projectStartDate(snapshot, record, now);
        const project: PortfolioProject = {
          id: projectId,
          handshakeId,
          participantOwnerIds: product.participantOwnerIds,
          title: projectTitle(snapshot, record),
          status: "active",
          startsAt: startDate,
          endsAt: createSevenDayPlan(startDate)[6]?.date ?? startDate,
          plan: createSevenDayPlan(startDate),
          checkIns: [],
          artifacts: [],
          feedback: [],
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };
        assertValid(validatePortfolioProject(project), "project");
        protocol = applyProtocolCommand(
          protocol,
          { type: "ADVANCE", to: "INTRODUCED" },
          `introduced-${projectId}`,
        );
        product = { ...product, status: protocol.status, projectId, updatedAt: now.toISOString() };
        projects = [...snapshot.projects, project];
        const contactReceipts = product.participantOwnerIds.map((participantOwnerId, index) => {
          const recipientOwnerId = otherParticipant(product, participantOwnerId);
          const contact = contacts.find((item) => item.ownerId === participantOwnerId);
          const receipt: PrivacyReceipt = {
            id: receiptIds[index] ?? this.#runtime.createId("receipt"),
            ownerId: participantOwnerId,
            handshakeId,
            kind: "contact_reveal",
            purpose: TEAMUP_PURPOSE,
            recipientOwnerId,
            subjectDigest: `sha256:${sha256(contact)}`,
            consentVersion: expectedConsentVersion,
            issuedAt: now.toISOString(),
            expiresAt: addDays(now, 30).toISOString(),
            revokedAt: null,
          };
          assertValid(validatePrivacyReceipt(receipt), "privacy receipt");
          return receipt;
        });
        receipts = [...snapshot.receipts, ...contactReceipts];
      }

      assertValid(validateProductHandshake(product), "handshake");
      const updated = { ...record, protocol, product };
      const next = { ...replaceHandshake(snapshot, updated), projects, receipts };
      return { snapshot: next, result: createHandshakeView(next, updated, ownerId) };
    });
  }

  public async listProjects(ownerId: string): Promise<readonly PortfolioProject[]> {
    const snapshot = await this.#read();
    requireOwner(snapshot, ownerId);
    return snapshot.projects.filter((item) => item.participantOwnerIds.includes(ownerId));
  }

  public async getProject(ownerId: string, projectId: string): Promise<PortfolioProject> {
    const snapshot = await this.#read();
    return requireProject(snapshot, ownerId, projectId);
  }

  public async addCheckIn(
    ownerId: string,
    projectId: string,
    input: AddCheckInInput,
  ): Promise<PortfolioProject> {
    const checkInId = this.#runtime.createId("checkin");
    const now = this.#runtime.now().toISOString();
    return this.#mutate((snapshot) => {
      const project = requireProject(snapshot, ownerId, projectId);
      if (project.status !== "active") {
        throw new ProductError("INVALID_STATE", "Project is not active.", 409);
      }
      if (!Number.isSafeInteger(input.day) || input.day < 1 || input.day > 7) {
        throw new ProductError("INVALID_INPUT", "day must be between 1 and 7.", 400);
      }
      const updated: PortfolioProject = {
        ...project,
        checkIns: [
          ...project.checkIns.filter(
            (item) => !(item.ownerId === ownerId && item.day === input.day),
          ),
          {
            id: checkInId,
            ownerId,
            day: input.day as 1 | 2 | 3 | 4 | 5 | 6 | 7,
            summary: nonBlank(input.summary, "summary"),
            blockers:
              input.blockers === undefined
                ? input.blocker?.trim()
                  ? [input.blocker.trim()]
                  : []
                : [...input.blockers],
            nextStep: nonBlank(input.nextStep, "nextStep"),
            createdAt: now,
          },
        ],
        updatedAt: now,
      };
      assertValid(validatePortfolioProject(updated), "project");
      return {
        snapshot: replaceProject(snapshot, updated),
        result: updated,
      };
    });
  }

  public async addArtifact(
    ownerId: string,
    projectId: string,
    input: AddArtifactInput,
  ): Promise<PortfolioProject> {
    const artifactId = this.#runtime.createId("artifact");
    const now = this.#runtime.now().toISOString();
    return this.#mutate((snapshot) => {
      const project = requireProject(snapshot, ownerId, projectId);
      if (project.status !== "active") {
        throw new ProductError("INVALID_STATE", "Project is not active.", 409);
      }
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        throw new ProductError("INVALID_INPUT", "Artifact URL is invalid.", 400);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new ProductError("INVALID_INPUT", "Artifact URL must use HTTP or HTTPS.", 400);
      }
      const updated: PortfolioProject = {
        ...project,
        artifacts: [
          ...project.artifacts,
          {
            id: artifactId,
            ownerId,
            title: nonBlank(input.title, "title"),
            url: url.toString(),
            createdAt: now,
          },
        ],
        updatedAt: now,
      };
      assertValid(validatePortfolioProject(updated), "project");
      return { snapshot: replaceProject(snapshot, updated), result: updated };
    });
  }

  public async addFeedback(
    ownerId: string,
    projectId: string,
    input: AddFeedbackInput,
  ): Promise<PortfolioProject> {
    const feedbackId = this.#runtime.createId("feedback");
    const now = this.#runtime.now().toISOString();
    return this.#mutate((snapshot) => {
      const project = requireProject(snapshot, ownerId, projectId);
      if (project.status !== "active") {
        throw new ProductError("INVALID_STATE", "Project feedback is already complete.", 409);
      }
      if (
        input.rating !== undefined &&
        (!Number.isSafeInteger(input.rating) || input.rating < 1 || input.rating > 5)
      ) {
        throw new ProductError("INVALID_INPUT", "rating must be an integer from 1 to 5.", 400);
      }
      const partnerOwnerId = project.participantOwnerIds.find((item) => item !== ownerId);
      if (partnerOwnerId === undefined) {
        throw new ProductError("INVALID_STATE", "Project partner is missing.", 500);
      }
      const ratingText = input.rating === undefined ? "" : `；评分 ${input.rating}/5`;
      const completionText =
        input.completed === undefined ? "" : input.completed ? "；已完成作品" : "；尚未完成作品";
      const summary = nonBlank(input.summary ?? input.comment ?? "已提交合作反馈", "summary");
      const feedback = {
        id: feedbackId,
        ownerId,
        partnerOwnerId,
        summary: `${summary}${ratingText}${completionText}`,
        wouldCollaborateAgain: input.wouldCollaborateAgain,
        createdAt: now,
      };
      const allFeedback = [
        ...project.feedback.filter((item) => item.ownerId !== ownerId),
        feedback,
      ];
      const completed = project.participantOwnerIds.every((participantId) =>
        allFeedback.some((item) => item.ownerId === participantId),
      );
      const updated: PortfolioProject = {
        ...project,
        status: completed ? "completed" : project.status,
        feedback: allFeedback,
        updatedAt: now,
      };
      assertValid(validatePortfolioProject(updated), "project");
      let handshakes = snapshot.handshakes;
      if (completed) {
        const record = snapshot.handshakes.find((item) => item.product.projectId === projectId);
        if (record !== undefined) {
          const protocol = applyProtocolCommand(
            record.protocol,
            { type: "ADVANCE", to: "FEEDBACK_COMPLETE" },
            `feedback-complete-${projectId}`,
          );
          const product: ProductHandshake = {
            ...record.product,
            status: protocol.status,
            updatedAt: now,
          };
          assertValid(validateProductHandshake(product), "handshake");
          const nextRecord = { ...record, protocol, product };
          handshakes = snapshot.handshakes.map((item) =>
            item.product.id === product.id ? nextRecord : item,
          );
        }
      }
      return {
        snapshot: { ...replaceProject(snapshot, updated), handshakes },
        result: updated,
      };
    });
  }

  public async listReceipts(ownerId: string): Promise<readonly PrivacyReceipt[]> {
    const snapshot = await this.#read();
    requireOwner(snapshot, ownerId);
    return snapshot.receipts.filter((item) => item.ownerId === ownerId);
  }

  async #read(): Promise<ProductCommunitySnapshot> {
    return (
      (await this.#store.load({ communityId: this.#communityId })) ??
      emptyProductSnapshot(this.#communityId)
    );
  }

  async #mutate<T>(
    operation: (snapshot: ProductCommunitySnapshot) => MutationResult<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await this.#read();
      const changed = operation(structuredClone(current));
      const next: ProductCommunitySnapshot = {
        ...changed.snapshot,
        communityId: this.#communityId,
        version: current.version + 1,
      };
      const result = await this.#store.save({
        communityId: this.#communityId,
        expectedVersion: current.version,
        snapshot: next,
      });
      if (result === "APPLIED") return changed.result;
    }
    throw new ProductError("CONFLICT", "Product state changed concurrently. Please retry.", 409);
  }
}

function findCandidates(
  snapshot: ProductCommunitySnapshot,
  ownerId: string,
  now: Date,
): Candidate[] {
  const self = buildProfile(snapshot, ownerId, now);
  return snapshot.owners
    .filter((owner) => owner.id !== ownerId && owner.status === "active")
    .flatMap((owner) => {
      try {
        return [matchCandidate(self, buildProfile(snapshot, owner.id, now))];
      } catch {
        return [];
      }
    });
}

function buildProfile(
  snapshot: ProductCommunitySnapshot,
  ownerId: string,
  now: Date,
): MatchProfile {
  const owner = requireOwner(snapshot, ownerId);
  const intent = snapshot.intents.find(
    (item) => item.ownerId === ownerId && item.status === "active",
  );
  const capsule = snapshot.capsules.find(
    (item) => item.ownerId === ownerId && item.status === "published",
  );
  const connection = snapshot.connections.find(
    (item) => item.id === capsule?.connectionId && item.status === "active",
  );
  const isExpired =
    capsule !== undefined &&
    (Date.parse(capsule.expiresAt) <= now.getTime() ||
      (intent !== undefined && Date.parse(intent.expiresAt) <= now.getTime()));
  if (intent === undefined || capsule === undefined || connection === undefined || isExpired) {
    throw new ProductError(
      "INVALID_STATE",
      "An active connection, published Capsule and project intent are required.",
      409,
    );
  }
  return { owner, connection, capsule, intent };
}

function requireOwner(snapshot: ProductCommunitySnapshot, ownerId: string): Owner {
  const owner = snapshot.owners.find((item) => item.id === ownerId && item.status === "active");
  if (owner === undefined) throw new ProductError("OWNER_NOT_FOUND", "Owner was not found.", 404);
  return owner;
}

function requireConnection(
  snapshot: ProductCommunitySnapshot,
  ownerId: string,
  connectionId: string,
): AiConnection {
  const connection = snapshot.connections.find(
    (item) => item.id === connectionId && item.ownerId === ownerId,
  );
  if (connection === undefined) {
    throw new ProductError("CONNECTION_NOT_FOUND", "AI connection was not found.", 404);
  }
  return connection;
}

function requireCapsule(
  snapshot: ProductCommunitySnapshot,
  ownerId: string,
  capsuleId: string,
): MemoryCapsule {
  const capsule = snapshot.capsules.find(
    (item) => item.id === capsuleId && item.ownerId === ownerId,
  );
  if (capsule === undefined) {
    throw new ProductError("CAPSULE_NOT_FOUND", "Memory Capsule was not found.", 404);
  }
  return capsule;
}

function requireIntent(
  snapshot: ProductCommunitySnapshot,
  ownerId: string,
  intentId: string,
): ProjectIntent {
  const intent = snapshot.intents.find((item) => item.id === intentId && item.ownerId === ownerId);
  if (intent === undefined) {
    throw new ProductError("INTENT_NOT_FOUND", "Project intent was not found.", 404);
  }
  return intent;
}

function requireHandshake(
  snapshot: ProductCommunitySnapshot,
  ownerId: string,
  handshakeId: string,
): ProductHandshakeRecord {
  const record = snapshot.handshakes.find(
    (item) => item.product.id === handshakeId && item.product.participantOwnerIds.includes(ownerId),
  );
  if (record === undefined) {
    throw new ProductError("HANDSHAKE_NOT_FOUND", "Handshake was not found.", 404);
  }
  return record;
}

function connectionForOwner(
  snapshot: ProductCommunitySnapshot,
  record: ProductHandshakeRecord,
  ownerId: string,
): AiConnection {
  const participantIndex = record.product.participantOwnerIds.indexOf(ownerId);
  const intentId = record.intentIds[participantIndex];
  const intent = snapshot.intents.find((item) => item.id === intentId && item.ownerId === ownerId);
  const capsule = snapshot.capsules.find((item) => item.id === intent?.capsuleId);
  const connection = snapshot.connections.find((item) => item.id === capsule?.connectionId);
  if (connection === undefined) {
    throw new ProductError("INVALID_STATE", "Handshake AI connection is missing.", 500);
  }
  return connection;
}

function replaceHandshake(
  snapshot: ProductCommunitySnapshot,
  updated: ProductHandshakeRecord,
): ProductCommunitySnapshot {
  return {
    ...snapshot,
    handshakes: snapshot.handshakes.map((item) =>
      item.product.id === updated.product.id ? updated : item,
    ),
  };
}

function requireProject(
  snapshot: ProductCommunitySnapshot,
  ownerId: string,
  projectId: string,
): PortfolioProject {
  const project = snapshot.projects.find(
    (item) => item.id === projectId && item.participantOwnerIds.includes(ownerId),
  );
  if (project === undefined) {
    throw new ProductError("PROJECT_NOT_FOUND", "Project was not found.", 404);
  }
  return project;
}

function replaceProject(
  snapshot: ProductCommunitySnapshot,
  updated: PortfolioProject,
): ProductCommunitySnapshot {
  return {
    ...snapshot,
    projects: snapshot.projects.map((item) => (item.id === updated.id ? updated : item)),
  };
}

function otherParticipant(handshake: ProductHandshake, ownerId: string): string {
  const other = handshake.participantOwnerIds.find((item) => item !== ownerId);
  if (other === undefined) {
    throw new ProductError("INVALID_STATE", "Handshake partner is missing.", 500);
  }
  return other;
}

function toCapsuleField(predicate: string): CapsuleFieldName {
  const normalized = predicate.trim();
  if (!CAPSULE_FIELD_NAMES.includes(normalized as CapsuleFieldName)) {
    throw new ProductError(
      "INVALID_INPUT",
      `predicate must be one of: ${CAPSULE_FIELD_NAMES.join(", ")}.`,
      400,
    );
  }
  return normalized as CapsuleFieldName;
}

function normalizeRecommendation(
  recommendation: SubmitRecommendationInput["recommendation"],
): "continue" | "needs_info" | "conflict" {
  if (recommendation === "owner_review") return "needs_info";
  if (recommendation === "decline") return "conflict";
  return recommendation;
}

function normalizeDecision(decision: SubmitDecisionInput["decision"]): Consent["decision"] {
  return decision === "more_info" ? "needs_info" : decision;
}

function projectTitle(snapshot: ProductCommunitySnapshot, record: ProductHandshakeRecord): string {
  const titles = record.intentIds
    .map((intentId) => snapshot.intents.find((item) => item.id === intentId)?.title)
    .filter((title): title is string => title !== undefined);
  return titles[0] ?? "7 天作品集项目";
}

function projectStartDate(
  snapshot: ProductCommunitySnapshot,
  record: ProductHandshakeRecord,
  now: Date,
): string {
  const today = calendarDate(now);
  const requestedDates = record.intentIds
    .map((intentId) => snapshot.intents.find((intent) => intent.id === intentId)?.startsOn)
    .filter((value): value is string => value !== undefined);
  return [today, ...requestedDates].sort().at(-1) ?? today;
}

function normalizeStartDate(value: string | undefined, now: Date): string {
  const startsOn = value?.trim() || calendarDate(now);
  const parsed = new Date(`${startsOn}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== startsOn
  ) {
    throw new ProductError("INVALID_INPUT", "startsOn must be a valid YYYY-MM-DD date.", 400);
  }
  if (startsOn < calendarDate(now)) {
    throw new ProductError("INVALID_INPUT", "startsOn cannot be in the past.", 400);
  }
  return startsOn;
}

function isFinishedHandshake(status: ProductHandshake["status"]): boolean {
  return [
    "NO_MATCH",
    "FEEDBACK_COMPLETE",
    "CANCELLED",
    "EXPIRED",
    "POLICY_BLOCKED",
    "FAILED",
    "DISPUTED",
  ].includes(status);
}

function normalizeProvider(provider: CreateConnectionInput["provider"]): AiProvider {
  return provider === "manual" || provider === "demo" ? "other" : provider;
}

function normalizeSourceMode(mode: ConnectionSourceMode | "manual_import"): ConnectionSourceMode {
  return mode === "manual_import" ? "import" : mode;
}

function normalizeApprovedFields(
  requested: readonly CapsuleFieldName[] | undefined,
  fields: CapsuleFields,
): CapsuleFieldName[] {
  const available = new Set(Object.keys(fields));
  const source = requested ?? [];
  return [...new Set(source)].filter((field) => available.has(field));
}

function inferWeeklyHours(availability: string | undefined): number {
  const match = availability?.match(/(\d{1,2})\s*(?:小时|hours?)/i);
  if (match?.[1] !== undefined) {
    const hours = Number(match[1]);
    if (Number.isFinite(hours) && hours > 0 && hours <= 80) return hours;
  }
  return 6;
}

function inferSlots(availability: string | undefined): string[] {
  const slots: string[] = [];
  if (availability?.includes("晚")) slots.push("weekday-evening");
  if (availability?.includes("周末")) slots.push("weekend");
  return slots.length === 0 ? ["flexible"] : slots;
}

function assertValid<T>(
  result: ValidationResult<T>,
  entity: string,
): asserts result is {
  success: true;
  data: T;
} {
  if (!result.success) {
    throw new ProductError("INVALID_INPUT", `Invalid ${entity}.`, 400, {
      issues: result.issues,
    });
  }
}
