import { describe, expect, it } from "vitest";
import {
  createConsentVersion,
  revealContacts,
  validateAiConnection,
  validateCandidate,
  validateClaim,
  validateConsent,
  validateMatchRecommendation,
  validateMemoryCapsule,
  validateOwner,
  validatePortfolioProject,
  validatePrivacyReceipt,
  validateProductHandshake,
  validateProductQuestion,
  validateProjectIntent,
} from "../src/index.js";
import {
  capsule,
  connection,
  handshake,
  intent,
  NOW,
  owner,
  project,
  receipt,
} from "./fixtures.js";

describe("V1 input validation", () => {
  it("accepts every valid top-level V1 product entity", () => {
    const validQuestion = {
      id: "question_1",
      handshakeId: "handshake_demo",
      fromOwnerId: "owner_alice",
      toOwnerId: "owner_bob",
      round: 1,
      prompt: "你是否能在周末完成集成？",
      requestedFields: ["availability"],
      required: true,
      purpose: "seven_day_portfolio_teamup",
      status: "pending",
      createdAt: NOW,
      expiresAt: "2026-09-24T08:00:00.000Z",
    };
    const validClaim = {
      id: "claim_1",
      handshakeId: "handshake_demo",
      questionId: "question_1",
      ownerId: "owner_bob",
      recipientOwnerId: "owner_alice",
      sourceConnectionId: "connection_owner_bob",
      predicate: "availability",
      value: "周末可投入 4 小时",
      purpose: "seven_day_portfolio_teamup",
      approvedByOwner: true,
      createdAt: NOW,
      expiresAt: "2026-09-24T08:00:00.000Z",
    };
    const validConsent = {
      ownerId: "owner_alice",
      decision: "continue",
      consentVersion: "consent_v1_abc",
      decidedAt: NOW,
    };

    expect(validateOwner(owner()).success).toBe(true);
    expect(validateAiConnection(connection()).success).toBe(true);
    expect(validateMemoryCapsule(capsule()).success).toBe(true);
    expect(validateProjectIntent(intent()).success).toBe(true);
    expect(validateProductQuestion(validQuestion).success).toBe(true);
    expect(validateClaim(validClaim).success).toBe(true);
    expect(validateConsent(validConsent).success).toBe(true);
    expect(validateProductHandshake(handshake()).success).toBe(true);
    expect(validatePortfolioProject(project()).success).toBe(true);
    expect(validatePrivacyReceipt(receipt()).success).toBe(true);
  });

  it("rejects unknown fields instead of creating a raw-memory escape hatch", () => {
    const result = validateMemoryCapsule({ ...capsule(), rawMemory: "private conversation" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual({
        path: "rawMemory",
        code: "unknown_field",
        message: "Unknown field is not allowed.",
      });
    }
  });

  it("rejects unapproved or unknown Capsule fields", () => {
    const base = capsule();
    const result = validateMemoryCapsule({
      ...base,
      status: "published",
      fields: { ...base.fields, contactDetails: "synthetic-contact-value" },
      approvedFields: [...base.approvedFields, "contactDetails"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects malformed dates, invalid question rounds, and unconfirmed Claims", () => {
    expect(validateOwner({ ...owner(), createdAt: "today" }).success).toBe(false);
    expect(
      validateProductQuestion({
        id: "q",
        handshakeId: "h",
        fromOwnerId: "a",
        toOwnerId: "b",
        round: 4,
        prompt: "test",
        requestedFields: ["goal"],
        purpose: "seven_day_portfolio_teamup",
        status: "pending",
        createdAt: NOW,
        expiresAt: "2026-09-24T08:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      validateClaim({
        id: "claim_1",
        handshakeId: "h",
        questionId: "q",
        ownerId: "a",
        recipientOwnerId: "b",
        sourceConnectionId: "c",
        predicate: "goal",
        value: "test",
        purpose: "seven_day_portfolio_teamup",
        approvedByOwner: false,
        createdAt: NOW,
        expiresAt: "2026-09-24T08:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects contacts embedded before dual consent", () => {
    const result = validateProductHandshake({
      ...handshake(),
      contactReveal: {
        revealedAt: NOW,
        contacts: [
          { ownerId: "owner_alice", kind: "email", value: "alice@example.test" },
          { ownerId: "owner_bob", kind: "email", value: "bob@example.test" },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it("validates matching DTOs and rejects fake score fields", () => {
    const recommendation = {
      ownerId: "owner_alice",
      connectionId: "connection_owner_alice",
      recommendation: "continue",
      reasons: ["能力互补"],
      gaps: [],
      createdAt: NOW,
    };
    const candidate = {
      ownerId: "owner_bob",
      displayName: "Bob",
      provider: "kimi",
      connectionMode: "mcp",
      capsule: { ...capsule("owner_bob", "kimi"), status: "published" },
      recommendation: "continue",
      reasons: ["能力互补"],
      gaps: [],
      conflicts: [],
      matchedOffers: ["TypeScript"],
      matchedSeeks: ["产品设计"],
      scheduleCompatible: true,
    };

    expect(validateMatchRecommendation(recommendation).success).toBe(true);
    expect(validateCandidate(candidate).success).toBe(true);
    expect(validateCandidate({ ...candidate, score: 97 }).success).toBe(false);
  });

  it("accepts an authorized contact reveal throughout the project lifecycle", () => {
    const base = handshake();
    const consentVersion = createConsentVersion(base.disclosureContent);
    const agreed = {
      ...base,
      decisions: [
        { ownerId: "owner_alice", decision: "continue", consentVersion, decidedAt: NOW },
        { ownerId: "owner_bob", decision: "continue", consentVersion, decidedAt: NOW },
      ],
    } as const;
    const revealed = revealContacts(
      agreed,
      [
        { ownerId: "owner_alice", kind: "email", value: "alice@example.test" },
        { ownerId: "owner_bob", kind: "email", value: "bob@example.test" },
      ],
      NOW,
    );

    expect(validateProductHandshake({ ...revealed, status: "INTRODUCED" }).success).toBe(true);
    expect(validateProductHandshake({ ...revealed, status: "FEEDBACK_COMPLETE" }).success).toBe(
      true,
    );
  });
});
