import { describe, expect, it } from "vitest";
import {
  assertHspMessage,
  checkProtocolCompatibility,
  HSP_MESSAGE_TYPES,
  HspProtocolError,
  validateAgentCard,
  validateClaimEnvelope,
  validateHspError,
  validateHspMessage,
  validateIntentCapsule,
} from "../src/index.js";
import {
  makeMessage,
  validAgentCard,
  validClaimEnvelope,
  validIntentCapsule,
  validPayloads,
} from "./fixtures.js";

describe("HSP 0.2 message contracts", () => {
  it.each(HSP_MESSAGE_TYPES)("validates %s", (type) => {
    const message = makeMessage(type, validPayloads[type]);
    expect(validateHspMessage(message)).toEqual({ ok: true, value: message });
  });

  it("binds payload validation to the message type", () => {
    const message = makeMessage("QUESTION", validPayloads.QUESTION);
    const invalid = { ...message, payload: validPayloads.PROPOSAL };
    const result = validateHspMessage(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_SCHEMA");
    }
  });

  it.each([
    ["continue", "ENOUGH_INFO"],
    ["continue", "HUMAN_REQUIRED"],
    ["continue", "LOW_CONFIDENCE"],
    ["decline", "SUCCESS_PROPOSAL"],
    ["owner_review", "SUCCESS_PROPOSAL"],
  ] as const)("rejects contradictory PROPOSAL semantics: %s/%s", (recommendation, stopCode) => {
    const message = {
      ...makeMessage("PROPOSAL", validPayloads.PROPOSAL),
      payload: { ...validPayloads.PROPOSAL, recommendation, stop_code: stopCode },
    };

    const result = validateHspMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_SCHEMA");
    }
  });

  it("keeps a non-success owner-review proposal valid at the protocol boundary", () => {
    const message = makeMessage("PROPOSAL", {
      ...validPayloads.PROPOSAL,
      recommendation: "owner_review",
      stop_code: "HUMAN_REQUIRED",
    });

    expect(validateHspMessage(message)).toEqual({ ok: true, value: message });
  });

  it("enforces the three-question round budget", () => {
    const question = validPayloads.QUESTION.questions[0];
    if (question === undefined) {
      throw new Error("Fixture must include a question");
    }
    const message = makeMessage("QUESTION", {
      round: 1,
      questions: [question, question, question, question],
    });
    expect(validateHspMessage(message).ok).toBe(false);
  });

  it("rejects undeclared envelope fields", () => {
    const message = makeMessage("QUESTION", validPayloads.QUESTION);
    expect(validateHspMessage({ ...message, private_memory: "must never be sent" }).ok).toBe(false);
  });

  it("requires a non-empty community boundary on every message", () => {
    const message = makeMessage("QUESTION", validPayloads.QUESTION);
    expect(validateHspMessage({ ...message, community_id: "" }).ok).toBe(false);

    const withoutCommunity: Record<string, unknown> = { ...message };
    delete withoutCommunity.community_id;
    expect(validateHspMessage(withoutCommunity).ok).toBe(false);
  });

  it("returns a version-specific error before schema errors", () => {
    const message = {
      ...makeMessage("QUESTION", validPayloads.QUESTION),
      protocol_version: "0.3.0",
    };
    const result = validateHspMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_PROTOCOL_VERSION");
    }
  });

  it("rejects an unknown message type by default", () => {
    const message = {
      ...makeMessage("QUESTION", validPayloads.QUESTION),
      type: "FUTURE_MESSAGE",
    };
    const result = validateHspMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_SCHEMA");
    }
  });

  it("can enforce message expiry against a supplied clock", () => {
    const message = makeMessage("QUESTION", validPayloads.QUESTION);
    const result = validateHspMessage(message, { now: new Date("2026-09-16T00:00:00.000Z") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MESSAGE_EXPIRED");
    }
  });

  it.each([
    ["starts after the message", "2026-09-14T08:00:01.000Z", "2026-09-15T08:00:00.000Z"],
    ["ends before the message", "2026-09-14T08:00:00.000Z", "2026-09-15T07:59:59.000Z"],
  ])("rejects claim authorization that %s", (_case, issuedAt, expiresAt) => {
    const message = makeMessage("CLAIM_RESPONSE", {
      ...validPayloads.CLAIM_RESPONSE,
      claim_envelope: {
        ...validClaimEnvelope,
        authorization_receipt: {
          ...validClaimEnvelope.authorization_receipt,
          issued_at: issuedAt,
          expires_at: expiresAt,
        },
      },
    });
    const result = validateHspMessage(message);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("throws the structured protocol error from the assertion API", () => {
    expect(() => assertHspMessage({})).toThrowError(HspProtocolError);
  });
});

describe("published object contracts", () => {
  it("validates AgentCard and IntentCapsule", () => {
    expect(validateAgentCard(validAgentCard).ok).toBe(true);
    expect(validateIntentCapsule(validIntentCapsule).ok).toBe(true);
  });

  it("rejects an AgentCard that tries to publish private memory", () => {
    expect(validateAgentCard({ ...validAgentCard, private_memory: { notes: "secret" } }).ok).toBe(
      false,
    );
  });

  it("rejects backwards IntentCapsule validity windows", () => {
    const result = validateIntentCapsule({
      ...validIntentCapsule,
      expires_at: "2026-09-13T08:00:00.000Z",
    });
    expect(result.ok).toBe(false);
  });

  it("checks claim authorization scope beyond JSON structure", () => {
    const result = validateClaimEnvelope({
      ...validClaimEnvelope,
      purpose: "find_engineering_partner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("requires every claim to authorize the envelope purpose", () => {
    const claim = validClaimEnvelope.claims[0];
    if (claim === undefined) {
      throw new Error("Fixture must include a claim");
    }
    const result = validateClaimEnvelope({
      ...validClaimEnvelope,
      claims: [{ ...claim, purposes: ["find_engineering_partner"] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("requires every claim to authorize the envelope recipient", () => {
    const claim = validClaimEnvelope.claims[0];
    if (claim === undefined) {
      throw new Error("Fixture must include a claim");
    }
    const result = validateClaimEnvelope({
      ...validClaimEnvelope,
      claims: [{ ...claim, audiences: ["agent_gamma"] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("blocks prohibited claims from the wire", () => {
    const claim = validClaimEnvelope.claims[0];
    if (claim === undefined) {
      throw new Error("Fixture must include a claim");
    }
    const result = validateClaimEnvelope({
      ...validClaimEnvelope,
      claims: [{ ...claim, sensitivity: "prohibited" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("POLICY_BLOCKED");
    }
  });
});

describe("compatibility and error contracts", () => {
  it("accepts patches on the 0.2 line and negotiates the lower patch", () => {
    expect(checkProtocolCompatibility("0.2.4")).toMatchObject({
      compatible: true,
      negotiated_version: "0.2.0",
    });
  });

  it("treats pre-1.0 minor versions as compatibility boundaries", () => {
    expect(checkProtocolCompatibility("0.3.0")).toMatchObject({
      compatible: false,
      reason: "UNSUPPORTED_MINOR",
    });
  });

  it("validates serialized protocol errors", () => {
    const error = new HspProtocolError({
      code: "RATE_LIMITED",
      message: "Endpoint request budget exceeded",
      retryable: true,
      handshake_id: "hs_alpha",
      details: { retry_after_seconds: 30 },
    });
    expect(validateHspError(error.toJSON()).ok).toBe(true);
  });
});
