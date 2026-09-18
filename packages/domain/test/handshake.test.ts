import { describe, expect, it } from "vitest";
import {
  applyHandshakeCommand,
  createHandshake,
  type Handshake,
  type HandshakeCommand,
  type HandshakeCommandResult,
  HandshakeDomainError,
  remainingBudget,
  validateHandshake,
} from "../src/index.js";

const DEFAULT_LIMITS = {
  maxRounds: 6,
  maxQuestionsPerRound: 3,
  maxTokens: 6_000,
  maxCostMicros: 1_000_000,
} as const;
const CONSENT_VERSION = "consent-v1";

function freshHandshake(limits = DEFAULT_LIMITS): Handshake {
  return createHandshake({
    id: "hs_01",
    communityId: "community_01",
    scene: "professional_collaboration",
    purpose: "find_product_design_partner",
    participantIds: ["owner_a", "owner_b"],
    budgetLimits: limits,
  });
}

let commandSequence = 0;

function execute(
  handshake: Handshake,
  command: HandshakeCommand,
  options: {
    readonly idempotencyKey?: string;
    readonly commandDigest?: string;
    readonly expectedVersion?: number;
  } = {},
): HandshakeCommandResult {
  commandSequence += 1;
  return applyHandshakeCommand(handshake, {
    idempotencyKey: options.idempotencyKey ?? `cmd_${commandSequence}`,
    commandDigest: options.commandDigest ?? `sha256:${commandSequence}`,
    expectedVersion: options.expectedVersion ?? handshake.version,
    command,
  });
}

function applied(handshake: Handshake, command: HandshakeCommand): Handshake {
  const result = execute(handshake, command);
  expect(result.outcome).toBe("APPLIED");
  if (result.outcome !== "APPLIED") {
    throw new Error(`Expected APPLIED, received ${result.outcome}`);
  }
  return result.handshake;
}

function rejectionCode(result: HandshakeCommandResult): string {
  expect(result.outcome).toBe("REJECTED");
  if (result.outcome !== "REJECTED") {
    throw new Error(`Expected REJECTED, received ${result.outcome}`);
  }
  return result.rejection.code;
}

function advanceToScreening(handshake = freshHandshake()): Handshake {
  let next = handshake;
  for (const status of [
    "READY",
    "DISCOVERING",
    "CANDIDATE_FOUND",
    "OWNER_AUTHORIZED",
    "SCREENING",
  ] as const) {
    next = applied(next, { type: "ADVANCE", to: status });
  }
  return next;
}

function advanceToConsent(handshake = freshHandshake()): Handshake {
  let next = advanceToScreening(handshake);
  next = applied(next, { type: "SUBMIT_PROPOSAL", participantId: "owner_a" });
  return applied(next, { type: "SUBMIT_PROPOSAL", participantId: "owner_b" });
}

function reveal(handshake = freshHandshake()): Handshake {
  let next = advanceToConsent(handshake);
  next = applied(next, {
    type: "SUBMIT_CONSENT",
    participantId: "owner_a",
    decision: "CONTINUE",
    consentVersion: CONSENT_VERSION,
  });
  return applied(next, {
    type: "SUBMIT_CONSENT",
    participantId: "owner_b",
    decision: "CONTINUE",
    consentVersion: CONSENT_VERSION,
  });
}

describe("handshake aggregate creation", () => {
  it("creates a valid draft with zero usage and version", () => {
    const handshake = freshHandshake();

    expect(handshake).toMatchObject({
      id: "hs_01",
      communityId: "community_01",
      scene: "professional_collaboration",
      purpose: "find_product_design_partner",
      participantIds: ["owner_a", "owner_b"],
      proposalParticipantIds: [],
      status: "DRAFT",
      version: 0,
      consentCycle: 0,
      ownerPause: null,
      dualConsent: null,
      termination: null,
      processedCommands: [],
    });
    expect(handshake.budget.usage).toEqual({
      rounds: 0,
      questions: 0,
      tokens: 0,
      costMicros: 0,
    });
    expect(validateHandshake(handshake)).toEqual([]);
  });

  it.each(["communityId", "scene", "purpose"] as const)(
    "reports a blank %s when validating rehydrated state",
    (field) => {
      const corrupted: Handshake = { ...freshHandshake(), [field]: " " };

      expect(validateHandshake(corrupted)).toContainEqual({
        path: field,
        message: expect.stringContaining("must not be blank"),
      });
    },
  );

  it.each([
    ["blank id", { id: " " }],
    ["blank community id", { communityId: " " }],
    ["blank scene", { scene: "\t" }],
    ["blank purpose", { purpose: "\n" }],
    ["same participant", { participantIds: ["owner_a", "owner_a"] as readonly [string, string] }],
    ["zero rounds", { budgetLimits: { ...DEFAULT_LIMITS, maxRounds: 0 } }],
    ["fractional tokens", { budgetLimits: { ...DEFAULT_LIMITS, maxTokens: 1.5 } }],
  ])("rejects invalid creation input: %s", (_label, replacement) => {
    const input = {
      id: "hs_01",
      communityId: "community_01",
      scene: "professional_collaboration",
      purpose: "find_product_design_partner",
      participantIds: ["owner_a", "owner_b"] as readonly [string, string],
      budgetLimits: DEFAULT_LIMITS,
      ...replacement,
    };

    expect(() => createHandshake(input)).toThrow(HandshakeDomainError);
  });
});

describe("normal state progression", () => {
  it("advances one legal state at a time and emits versioned changes", () => {
    const initial = freshHandshake();
    const result = execute(initial, { type: "ADVANCE", to: "READY" });

    expect(result.outcome).toBe("APPLIED");
    if (result.outcome !== "APPLIED") {
      return;
    }
    expect(result.handshake.status).toBe("READY");
    expect(result.handshake.version).toBe(1);
    expect(result.events).toEqual([
      { type: "HANDSHAKE_STATUS_CHANGED", from: "DRAFT", to: "READY" },
    ]);
    expect(initial.status).toBe("DRAFT");
    expect(initial.version).toBe(0);
  });

  it("rejects a skipped or backwards transition without mutation", () => {
    const initial = freshHandshake();
    const skipped = execute(initial, { type: "ADVANCE", to: "SCREENING" });

    expect(rejectionCode(skipped)).toBe("INVALID_TRANSITION");
    expect(skipped.handshake).toBe(initial);
    expect(initial.processedCommands).toEqual([]);
  });

  it("requires specialized commands for protected edges", () => {
    const screening = advanceToScreening();
    expect(rejectionCode(execute(screening, { type: "ADVANCE", to: "WAITING_OWNER" }))).toBe(
      "SPECIALIZED_COMMAND_REQUIRED",
    );
    expect(rejectionCode(execute(screening, { type: "ADVANCE", to: "PROPOSAL" }))).toBe(
      "SPECIALIZED_COMMAND_REQUIRED",
    );

    const proposal = applied(screening, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_a",
    });
    expect(rejectionCode(execute(proposal, { type: "ADVANCE", to: "WAITING_DUAL_CONSENT" }))).toBe(
      "SPECIALIZED_COMMAND_REQUIRED",
    );

    const consent = advanceToConsent();
    expect(rejectionCode(execute(consent, { type: "ADVANCE", to: "REVEALED" }))).toBe(
      "SPECIALIZED_COMMAND_REQUIRED",
    );
  });

  it("reaches the successful terminal state only after reveal and introduction", () => {
    let handshake = reveal();
    handshake = applied(handshake, { type: "ADVANCE", to: "INTRODUCED" });
    handshake = applied(handshake, { type: "ADVANCE", to: "FEEDBACK_COMPLETE" });

    expect(handshake.status).toBe("FEEDBACK_COMPLETE");
    expect(validateHandshake(handshake)).toEqual([]);
    expect(rejectionCode(execute(handshake, { type: "DISPUTE" }))).toBe("TERMINAL_STATE");
  });

  it("preserves tenant and purpose context through every command family", () => {
    const expectedContext = {
      communityId: "community_01",
      scene: "professional_collaboration",
      purpose: "find_product_design_partner",
    } as const;
    const expectContext = (handshake: Handshake): void => {
      expect(handshake).toMatchObject(expectedContext);
    };

    let handshake = advanceToScreening();
    expectContext(handshake);

    handshake = applied(handshake, {
      type: "RECORD_ROUND",
      questions: 1,
      tokens: 100,
      costMicros: 10_000,
    });
    expectContext(handshake);

    handshake = applied(handshake, {
      type: "REQUEST_OWNER",
      participantId: "owner_a",
      questionId: "oq_context",
      reason: "Confirm availability",
    });
    expectContext(handshake);

    handshake = applied(handshake, {
      type: "RESOLVE_OWNER_REQUEST",
      participantId: "owner_a",
      questionId: "oq_context",
      resolution: "ANSWERED",
    });
    expectContext(handshake);

    handshake = applied(handshake, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_a",
    });
    handshake = applied(handshake, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_b",
    });
    handshake = applied(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });
    expectContext(handshake);

    handshake = applied(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_b",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });
    handshake = applied(handshake, { type: "DISPUTE" });
    expectContext(handshake);

    const terminated = applied(freshHandshake(), {
      type: "TERMINATE",
      to: "CANCELLED",
      code: "USER_CANCELLED",
    });
    expectContext(terminated);
  });
});

describe("round and budget invariants", () => {
  it("records an entire logical round atomically", () => {
    const screening = advanceToScreening();
    const result = execute(screening, {
      type: "RECORD_ROUND",
      questions: 3,
      tokens: 700,
      costMicros: 120_000,
    });

    expect(result.outcome).toBe("APPLIED");
    if (result.outcome !== "APPLIED") {
      return;
    }
    expect(result.handshake.budget.usage).toEqual({
      rounds: 1,
      questions: 3,
      tokens: 700,
      costMicros: 120_000,
    });
    expect(result.events).toContainEqual({
      type: "ROUND_RECORDED",
      round: 1,
      questions: 3,
      tokens: 700,
      costMicros: 120_000,
    });
    expect(remainingBudget(result.handshake)).toEqual({
      maxRounds: 5,
      maxQuestionsPerRound: 3,
      maxTokens: 5_300,
      maxCostMicros: 880_000,
    });
  });

  it.each([
    ["QUESTION_LIMIT_EXCEEDED", { questions: 4, tokens: 1, costMicros: 1 }],
    ["TOKEN_BUDGET_EXCEEDED", { questions: 1, tokens: 6_001, costMicros: 1 }],
    ["COST_BUDGET_EXCEEDED", { questions: 1, tokens: 1, costMicros: 1_000_001 }],
    ["INVALID_ROUND_USAGE", { questions: -1, tokens: 1, costMicros: 1 }],
    ["INVALID_ROUND_USAGE", { questions: 0, tokens: 0, costMicros: 0 }],
  ])("rejects invalid usage with %s", (expectedCode, usage) => {
    const screening = advanceToScreening();
    const result = execute(screening, { type: "RECORD_ROUND", ...usage });

    expect(rejectionCode(result)).toBe(expectedCode);
    expect(result.handshake.version).toBe(screening.version);
    expect(result.handshake.budget.usage.rounds).toBe(0);
  });

  it("accepts exact limits but never a seventh round", () => {
    let handshake = advanceToScreening();
    for (let round = 0; round < 6; round += 1) {
      handshake = applied(handshake, {
        type: "RECORD_ROUND",
        questions: 3,
        tokens: 1_000,
        costMicros: round === 5 ? 995_000 : 1_000,
      });
    }

    expect(handshake.budget.usage).toEqual({
      rounds: 6,
      questions: 18,
      tokens: 6_000,
      costMicros: 1_000_000,
    });
    expect(
      rejectionCode(
        execute(handshake, {
          type: "RECORD_ROUND",
          questions: 1,
          tokens: 0,
          costMicros: 0,
        }),
      ),
    ).toBe("ROUND_LIMIT_EXCEEDED");
  });

  it("does not permit round accounting while waiting for an owner", () => {
    const paused = applied(advanceToScreening(), {
      type: "REQUEST_OWNER",
      participantId: "owner_a",
      questionId: "oq_1",
      reason: "Confirm weekly availability",
    });

    const result = execute(paused, {
      type: "RECORD_ROUND",
      questions: 1,
      tokens: 10,
      costMicros: 10,
    });
    expect(rejectionCode(result)).toBe("INVALID_TRANSITION");
    expect(result.handshake.budget.usage.rounds).toBe(0);
  });
});

describe("two-party proposal barrier", () => {
  it("records the first participant and enters PROPOSAL", () => {
    const screening = advanceToScreening();
    const result = execute(screening, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_b",
    });

    expect(result.outcome).toBe("APPLIED");
    if (result.outcome !== "APPLIED") {
      return;
    }
    expect(result.handshake.status).toBe("PROPOSAL");
    expect(result.handshake.proposalParticipantIds).toEqual(["owner_b"]);
    expect(result.events).toEqual([
      {
        type: "PROPOSAL_SUBMITTED",
        participantId: "owner_b",
        submittedCount: 1,
      },
      { type: "HANDSHAKE_STATUS_CHANGED", from: "SCREENING", to: "PROPOSAL" },
    ]);
    expect(screening.proposalParticipantIds).toEqual([]);
  });

  it("atomically starts a fresh dual-consent cycle after the other participant submits", () => {
    let handshake = advanceToScreening();
    handshake = applied(handshake, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_b",
    });
    const result = execute(handshake, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_a",
    });

    expect(result.outcome).toBe("APPLIED");
    if (result.outcome !== "APPLIED") {
      return;
    }
    expect(result.handshake.status).toBe("WAITING_DUAL_CONSENT");
    expect(result.handshake.proposalParticipantIds).toEqual(["owner_b", "owner_a"]);
    expect(result.handshake.consentCycle).toBe(1);
    expect(result.handshake.dualConsent).toEqual({
      cycle: 1,
      consentVersion: null,
      decisions: [
        { participantId: "owner_a", decision: "PENDING" },
        { participantId: "owner_b", decision: "PENDING" },
      ],
    });
    expect(result.events).toEqual([
      {
        type: "PROPOSAL_SUBMITTED",
        participantId: "owner_a",
        submittedCount: 2,
      },
      {
        type: "HANDSHAKE_STATUS_CHANGED",
        from: "PROPOSAL",
        to: "WAITING_DUAL_CONSENT",
      },
    ]);
  });

  it("rejects a repeated submission without changing durable progress", () => {
    const proposal = applied(advanceToScreening(), {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_a",
    });
    const repeated = execute(proposal, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_a",
    });

    expect(rejectionCode(repeated)).toBe("PROPOSAL_ALREADY_SUBMITTED");
    expect(repeated.handshake).toBe(proposal);
    expect(repeated.handshake.proposalParticipantIds).toEqual(["owner_a"]);
  });

  it("rejects a non-participant and submissions outside proposal states", () => {
    const screening = advanceToScreening();
    expect(
      rejectionCode(
        execute(screening, {
          type: "SUBMIT_PROPOSAL",
          participantId: "stranger",
        }),
      ),
    ).toBe("INVALID_PARTICIPANT");
    expect(
      rejectionCode(
        execute(freshHandshake(), {
          type: "SUBMIT_PROPOSAL",
          participantId: "owner_a",
        }),
      ),
    ).toBe("INVALID_TRANSITION");
  });

  it("continues correctly after JSON persistence and rehydration", () => {
    const first = applied(advanceToScreening(), {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_a",
    });
    const rehydrated = JSON.parse(JSON.stringify(first)) as Handshake;

    expect(validateHandshake(rehydrated)).toEqual([]);
    const second = applied(rehydrated, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_b",
    });
    expect(second.status).toBe("WAITING_DUAL_CONSENT");
    expect(second.proposalParticipantIds).toEqual(["owner_a", "owner_b"]);
  });
});

describe("OWNER_REQUIRED pause and resume", () => {
  it("pauses screening and resumes the exact previous state", () => {
    const screening = advanceToScreening();
    const paused = applied(screening, {
      type: "REQUEST_OWNER",
      participantId: "owner_a",
      questionId: "oq_1",
      reason: "The source conflicts with a recent answer",
    });

    expect(paused.status).toBe("WAITING_OWNER");
    expect(paused.ownerPause).toMatchObject({
      participantId: "owner_a",
      questionId: "oq_1",
      resumeStatus: "SCREENING",
    });

    const resumed = applied(paused, {
      type: "RESOLVE_OWNER_REQUEST",
      participantId: "owner_a",
      questionId: "oq_1",
      resolution: "ANSWERED",
    });
    expect(resumed.status).toBe("SCREENING");
    expect(resumed.ownerPause).toBeNull();
    expect(resumed.budget.usage).toEqual(screening.budget.usage);
  });

  it("returns to CLARIFYING when that was the paused state", () => {
    let handshake = advanceToScreening();
    handshake = applied(handshake, { type: "ADVANCE", to: "CLARIFYING" });
    handshake = applied(handshake, {
      type: "REQUEST_OWNER",
      participantId: "owner_b",
      questionId: "oq_2",
      reason: "Permission expansion is required",
    });
    handshake = applied(handshake, {
      type: "RESOLVE_OWNER_REQUEST",
      participantId: "owner_b",
      questionId: "oq_2",
      resolution: "ANSWERED",
    });

    expect(handshake.status).toBe("CLARIFYING");
  });

  it("rejects a response for the wrong owner question", () => {
    const paused = applied(advanceToScreening(), {
      type: "REQUEST_OWNER",
      participantId: "owner_a",
      questionId: "oq_1",
      reason: "Confirm a fact",
    });
    const result = execute(paused, {
      type: "RESOLVE_OWNER_REQUEST",
      participantId: "owner_b",
      questionId: "oq_other",
      resolution: "ANSWERED",
    });

    expect(rejectionCode(result)).toBe("INVALID_OWNER_REQUEST");
    expect(result.handshake).toBe(paused);
  });

  it("ends without exposing detail when the owner declines", () => {
    let handshake = applied(advanceToScreening(), {
      type: "REQUEST_OWNER",
      participantId: "owner_a",
      questionId: "oq_1",
      reason: "Confirm a claim",
    });
    handshake = applied(handshake, {
      type: "RESOLVE_OWNER_REQUEST",
      participantId: "owner_a",
      questionId: "oq_1",
      resolution: "DECLINED",
    });

    expect(handshake.status).toBe("REJECTED");
    expect(handshake.termination).toEqual({ status: "REJECTED", code: "OWNER_DECLINED" });
    expect(handshake.ownerPause).toBeNull();
  });
});

describe("dual consent", () => {
  it("does not reveal after only one owner continues", () => {
    const waiting = advanceToConsent();
    const first = execute(waiting, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });

    expect(first.outcome).toBe("APPLIED");
    if (first.outcome !== "APPLIED") {
      return;
    }
    expect(first.handshake.status).toBe("WAITING_DUAL_CONSENT");
    expect(first.handshake.dualConsent?.consentVersion).toBe(CONSENT_VERSION);
    expect(first.handshake.dualConsent?.decisions).toEqual([
      { participantId: "owner_a", decision: "CONTINUE" },
      { participantId: "owner_b", decision: "PENDING" },
    ]);
    expect(first.events.some((event) => event.type === "DUAL_CONSENT_REACHED")).toBe(false);
  });

  it("reveals atomically only after both owners continue", () => {
    const revealed = reveal();

    expect(revealed.status).toBe("REVEALED");
    expect(revealed.dualConsent?.decisions.every((entry) => entry.decision === "CONTINUE")).toBe(
      true,
    );
  });

  it("requires both owners to accept the same consent version", () => {
    let handshake = advanceToConsent();
    handshake = applied(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: "proposal-version-a",
    });

    const mismatched = execute(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_b",
      decision: "CONTINUE",
      consentVersion: "proposal-version-b",
    });

    expect(rejectionCode(mismatched)).toBe("CONSENT_VERSION_MISMATCH");
    expect(mismatched.handshake).toBe(handshake);
    expect(handshake.status).toBe("WAITING_DUAL_CONSENT");
  });

  it("rejects a blank consent version at the aggregate boundary", () => {
    const result = execute(advanceToConsent(), {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: "   ",
    });

    expect(rejectionCode(result)).toBe("INVALID_COMMAND");
  });

  it("moves to NO_MATCH as soon as either owner declines", () => {
    const declined = applied(advanceToConsent(), {
      type: "SUBMIT_CONSENT",
      participantId: "owner_b",
      decision: "DECLINE",
      consentVersion: CONSENT_VERSION,
    });

    expect(declined.status).toBe("NO_MATCH");
    expect(declined.termination).toEqual({ status: "NO_MATCH", code: "OWNER_DECLINED" });
  });

  it("returns to clarification for MORE_INFO and starts a fresh consent cycle later", () => {
    let handshake = advanceToConsent();
    expect(handshake.consentCycle).toBe(1);
    handshake = applied(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "MORE_INFO",
      consentVersion: CONSENT_VERSION,
    });
    expect(handshake.status).toBe("CLARIFYING");

    expect(handshake.proposalParticipantIds).toEqual([]);
    handshake = applied(handshake, { type: "ADVANCE", to: "SCREENING" });
    handshake = applied(handshake, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_b",
    });
    handshake = applied(handshake, {
      type: "SUBMIT_PROPOSAL",
      participantId: "owner_a",
    });

    expect(handshake.consentCycle).toBe(2);
    expect(handshake.dualConsent?.decisions.map((entry) => entry.decision)).toEqual([
      "PENDING",
      "PENDING",
    ]);
    expect(handshake.dualConsent?.consentVersion).toBeNull();
  });

  it("accepts only one decision per owner in a consent cycle", () => {
    let handshake = advanceToConsent();
    handshake = applied(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });
    const repeated = execute(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });

    expect(rejectionCode(repeated)).toBe("OWNER_DECISION_ALREADY_RECORDED");
  });

  it("includes the shared consent version in the final audit event", () => {
    let handshake = advanceToConsent();
    handshake = applied(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });
    const second = execute(handshake, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_b",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });

    expect(second.outcome).toBe("APPLIED");
    expect(second.events).toContainEqual({
      type: "DUAL_CONSENT_REACHED",
      cycle: 1,
      consentVersion: CONSENT_VERSION,
    });
  });
});

describe("concurrency and idempotency", () => {
  it("rejects a stale optimistic version", () => {
    const initial = freshHandshake();
    const result = execute(initial, { type: "ADVANCE", to: "READY" }, { expectedVersion: 7 });

    expect(rejectionCode(result)).toBe("VERSION_CONFLICT");
    expect(result.handshake).toBe(initial);
  });

  it("returns a duplicate before checking its now-stale expected version", () => {
    const initial = freshHandshake();
    const envelopeOptions = {
      idempotencyKey: "cmd_ready",
      commandDigest: "sha256:ready",
      expectedVersion: 0,
    } as const;
    const first = execute(initial, { type: "ADVANCE", to: "READY" }, envelopeOptions);
    expect(first.outcome).toBe("APPLIED");
    if (first.outcome !== "APPLIED") {
      return;
    }

    const duplicate = execute(first.handshake, { type: "ADVANCE", to: "READY" }, envelopeOptions);
    expect(duplicate.outcome).toBe("DUPLICATE");
    if (duplicate.outcome !== "DUPLICATE") {
      return;
    }
    expect(duplicate.originalResultingVersion).toBe(1);
    expect(duplicate.handshake.version).toBe(1);
    expect(duplicate.events).toEqual([]);
    expect(duplicate.handshake.processedCommands).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key for a different digest", () => {
    const first = execute(
      freshHandshake(),
      { type: "ADVANCE", to: "READY" },
      { idempotencyKey: "same-key", commandDigest: "sha256:first" },
    );
    expect(first.outcome).toBe("APPLIED");
    if (first.outcome !== "APPLIED") {
      return;
    }

    const conflict = execute(
      first.handshake,
      { type: "ADVANCE", to: "DISCOVERING" },
      {
        idempotencyKey: "same-key",
        commandDigest: "sha256:second",
        expectedVersion: first.handshake.version,
      },
    );
    expect(rejectionCode(conflict)).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("still recognizes a successful duplicate after reaching a terminal state", () => {
    const initial = freshHandshake();
    const options = {
      idempotencyKey: "cancel-once",
      commandDigest: "sha256:cancel",
      expectedVersion: 0,
    } as const;
    const cancelled = execute(
      initial,
      { type: "TERMINATE", to: "CANCELLED", code: "USER_CANCELLED" },
      options,
    );
    expect(cancelled.outcome).toBe("APPLIED");
    if (cancelled.outcome !== "APPLIED") {
      return;
    }

    const duplicate = execute(
      cancelled.handshake,
      { type: "TERMINATE", to: "CANCELLED", code: "USER_CANCELLED" },
      options,
    );
    expect(duplicate.outcome).toBe("DUPLICATE");
  });
});

describe("termination and disputes", () => {
  it.each([
    ["CANCELLED", "USER_CANCELLED"],
    ["EXPIRED", "TIMEOUT"],
    ["POLICY_BLOCKED", "POLICY_BLOCKED"],
    ["FAILED", "BUDGET_EXHAUSTED"],
  ] as const)("terminates an active handshake as %s", (status, code) => {
    const result = execute(advanceToScreening(), { type: "TERMINATE", to: status, code });

    expect(result.outcome).toBe("APPLIED");
    if (result.outcome !== "APPLIED") {
      return;
    }
    expect(result.handshake.status).toBe(status);
    expect(result.handshake.termination).toEqual({ status, code });
    expect(rejectionCode(execute(result.handshake, { type: "DISPUTE" }))).toBe("TERMINAL_STATE");
  });

  it("enforces status-specific timeout and policy stop codes", () => {
    const screening = advanceToScreening();
    expect(
      rejectionCode(
        execute(screening, {
          type: "TERMINATE",
          to: "EXPIRED",
          code: "SYSTEM_FAILURE",
        }),
      ),
    ).toBe("INVALID_COMMAND");
    expect(
      rejectionCode(
        execute(screening, {
          type: "TERMINATE",
          to: "POLICY_BLOCKED",
          code: "LOW_CONFIDENCE",
        }),
      ),
    ).toBe("INVALID_COMMAND");
  });

  it("allows disputes only after reveal or introduction", () => {
    expect(rejectionCode(execute(advanceToScreening(), { type: "DISPUTE" }))).toBe(
      "INVALID_TRANSITION",
    );

    const disputedAfterReveal = applied(reveal(), { type: "DISPUTE" });
    expect(disputedAfterReveal.status).toBe("DISPUTED");

    const introduced = applied(reveal(), { type: "ADVANCE", to: "INTRODUCED" });
    const disputedAfterIntroduction = applied(introduced, { type: "DISPUTE" });
    expect(disputedAfterIntroduction.status).toBe("DISPUTED");
  });
});

describe("aggregate validation", () => {
  it("rejects commands against a corrupted aggregate", () => {
    const valid = advanceToScreening();
    const corrupted: Handshake = {
      ...valid,
      budget: {
        ...valid.budget,
        usage: { ...valid.budget.usage, rounds: 99 },
      },
    };

    expect(validateHandshake(corrupted)).not.toEqual([]);
    expect(rejectionCode(execute(corrupted, { type: "ADVANCE", to: "PROPOSAL" }))).toBe(
      "INVALID_AGGREGATE",
    );
  });

  it.each([
    ["duplicate proposal participant", ["owner_a", "owner_a"]],
    ["unknown proposal participant", ["owner_a", "stranger"]],
  ])("rejects corrupted proposal progress: %s", (_label, proposalParticipantIds) => {
    const valid = advanceToConsent();
    const corrupted: Handshake = { ...valid, proposalParticipantIds };

    expect(validateHandshake(corrupted)).toContainEqual({
      path: "proposalParticipantIds",
      message: "Proposal progress may contain each handshake participant at most once.",
    });
    expect(
      rejectionCode(
        execute(corrupted, {
          type: "SUBMIT_CONSENT",
          participantId: "owner_a",
          decision: "CONTINUE",
          consentVersion: CONSENT_VERSION,
        }),
      ),
    ).toBe("INVALID_AGGREGATE");
  });

  it("rejects consent history without its bound version", () => {
    let valid = advanceToConsent();
    valid = applied(valid, {
      type: "SUBMIT_CONSENT",
      participantId: "owner_a",
      decision: "CONTINUE",
      consentVersion: CONSENT_VERSION,
    });
    const corrupted: Handshake = {
      ...valid,
      dualConsent:
        valid.dualConsent === null ? null : { ...valid.dualConsent, consentVersion: null },
    };

    expect(validateHandshake(corrupted)).toContainEqual({
      path: "dualConsent.consentVersion",
      message: "A submitted owner decision must bind a consent version.",
    });
  });

  it("rejects a pre-bound version while both owner decisions are pending", () => {
    const valid = advanceToConsent();
    const corrupted: Handshake = {
      ...valid,
      dualConsent:
        valid.dualConsent === null
          ? null
          : { ...valid.dualConsent, consentVersion: CONSENT_VERSION },
    };

    expect(validateHandshake(corrupted)).toContainEqual({
      path: "dualConsent.consentVersion",
      message: "Pending owner decisions cannot bind a consent version yet.",
    });
  });
});
