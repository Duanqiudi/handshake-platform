import { canTransition, isHandshakeStatus, isTerminalStatus } from "./state-machine.js";
import {
  ABNORMAL_TERMINATION_STATUSES,
  type AbnormalTerminationStatus,
  type CommandRejection,
  type CommandRejectionCode,
  type ConsentDecision,
  type CreateHandshakeInput,
  type DualConsent,
  type Handshake,
  type HandshakeBudgetLimits,
  type HandshakeCommand,
  type HandshakeCommandEnvelope,
  type HandshakeCommandResult,
  type HandshakeDomainEvent,
  type HandshakeInvariantViolation,
  type HandshakeStatus,
  OWNER_RESOLUTIONS,
  type ParticipantConsent,
  type ProcessedCommand,
  TERMINAL_HANDSHAKE_STATUSES,
  TERMINATION_CODES,
  type TerminalHandshakeStatus,
  type TerminationCode,
} from "./types.js";

const abnormalTerminationSet = new Set<HandshakeStatus>(ABNORMAL_TERMINATION_STATUSES);
const terminalStatusSet = new Set<HandshakeStatus>(TERMINAL_HANDSHAKE_STATUSES);
const consentDecisionSet = new Set<ConsentDecision>([
  "PENDING",
  "CONTINUE",
  "DECLINE",
  "MORE_INFO",
]);
const submittedConsentDecisionSet = new Set<string>(["CONTINUE", "DECLINE", "MORE_INFO"]);
const ownerResolutionSet = new Set<string>(OWNER_RESOLUTIONS);
const terminationCodeSet = new Set<string>(TERMINATION_CODES);

export class HandshakeDomainError extends Error {
  public readonly code: "INVALID_CONFIGURATION";

  public constructor(message: string) {
    super(message);
    this.name = "HandshakeDomainError";
    this.code = "INVALID_CONFIGURATION";
  }
}

export function createHandshake(input: CreateHandshakeInput): Handshake {
  assertCreationInput(input);

  return {
    id: input.id,
    communityId: input.communityId,
    scene: input.scene,
    purpose: input.purpose,
    participantIds: [...input.participantIds],
    proposalParticipantIds: [],
    status: "DRAFT",
    version: 0,
    budget: {
      limits: { ...input.budgetLimits },
      usage: {
        rounds: 0,
        questions: 0,
        tokens: 0,
        costMicros: 0,
      },
    },
    ownerPause: null,
    consentCycle: 0,
    dualConsent: null,
    termination: null,
    processedCommands: [],
  };
}

export function remainingBudget(handshake: Handshake): HandshakeBudgetLimits {
  return {
    maxRounds: handshake.budget.limits.maxRounds - handshake.budget.usage.rounds,
    maxQuestionsPerRound: handshake.budget.limits.maxQuestionsPerRound,
    maxTokens: handshake.budget.limits.maxTokens - handshake.budget.usage.tokens,
    maxCostMicros: handshake.budget.limits.maxCostMicros - handshake.budget.usage.costMicros,
  };
}

export function validateHandshake(handshake: Handshake): readonly HandshakeInvariantViolation[] {
  const violations: HandshakeInvariantViolation[] = [];
  const add = (path: string, message: string): void => {
    violations.push({ path, message });
  };

  if (!isNonBlank(handshake.id)) {
    add("id", "Handshake id must not be blank.");
  }

  if (!isNonBlank(handshake.communityId)) {
    add("communityId", "Community id must not be blank.");
  }
  if (!isNonBlank(handshake.scene)) {
    add("scene", "Scene must not be blank.");
  }
  if (!isNonBlank(handshake.purpose)) {
    add("purpose", "Purpose must not be blank.");
  }

  if (
    handshake.participantIds.length !== 2 ||
    !handshake.participantIds.every(isNonBlank) ||
    handshake.participantIds[0] === handshake.participantIds[1]
  ) {
    add("participantIds", "Exactly two distinct, non-blank participants are required.");
  }

  validateProposalParticipants(handshake, add);

  if (!isHandshakeStatus(handshake.status)) {
    add("status", "Unknown handshake status.");
  }

  if (!isNonNegativeSafeInteger(handshake.version)) {
    add("version", "Version must be a non-negative safe integer.");
  }

  validateLimits(handshake.budget.limits, add);
  const usage = handshake.budget.usage;
  for (const [key, value] of Object.entries(usage)) {
    if (!isNonNegativeSafeInteger(value)) {
      add(`budget.usage.${key}`, "Budget usage must be a non-negative safe integer.");
    }
  }

  if (usage.rounds > handshake.budget.limits.maxRounds) {
    add("budget.usage.rounds", "Used rounds exceed the configured limit.");
  }
  if (usage.tokens > handshake.budget.limits.maxTokens) {
    add("budget.usage.tokens", "Used tokens exceed the configured limit.");
  }
  if (usage.costMicros > handshake.budget.limits.maxCostMicros) {
    add("budget.usage.costMicros", "Used cost exceeds the configured limit.");
  }
  if (
    usage.rounds === 0
      ? usage.questions !== 0
      : usage.questions / usage.rounds > handshake.budget.limits.maxQuestionsPerRound
  ) {
    add("budget.usage.questions", "Question usage is impossible for the recorded rounds.");
  }

  if (!isNonNegativeSafeInteger(handshake.consentCycle)) {
    add("consentCycle", "Consent cycle must be a non-negative safe integer.");
  }

  if (handshake.status === "WAITING_OWNER") {
    if (handshake.ownerPause === null) {
      add("ownerPause", "WAITING_OWNER requires owner pause context.");
    }
  } else if (handshake.ownerPause !== null) {
    add("ownerPause", "Owner pause context may only exist while WAITING_OWNER.");
  }

  if (handshake.ownerPause !== null) {
    if (!handshake.participantIds.includes(handshake.ownerPause.participantId)) {
      add("ownerPause.participantId", "Owner request participant is not in this handshake.");
    }
    if (!isNonBlank(handshake.ownerPause.questionId) || !isNonBlank(handshake.ownerPause.reason)) {
      add("ownerPause", "Owner question id and reason must not be blank.");
    }
    if (
      handshake.ownerPause.resumeStatus !== "SCREENING" &&
      handshake.ownerPause.resumeStatus !== "CLARIFYING"
    ) {
      add("ownerPause.resumeStatus", "Owner requests can only resume a conversational state.");
    }
  }

  validateDualConsent(handshake, add);
  validateTermination(handshake, add);
  validateProcessedCommands(handshake, add);

  return violations;
}

export function applyHandshakeCommand(
  handshake: Handshake,
  envelope: HandshakeCommandEnvelope,
): HandshakeCommandResult {
  const aggregateViolations = validateHandshake(handshake);
  if (aggregateViolations.length > 0) {
    return rejected(
      handshake,
      "INVALID_AGGREGATE",
      aggregateViolations.map((violation) => `${violation.path}: ${violation.message}`).join("; "),
    );
  }

  if (
    !isNonBlank(envelope.idempotencyKey) ||
    !isNonBlank(envelope.commandDigest) ||
    !isNonNegativeSafeInteger(envelope.expectedVersion)
  ) {
    return rejected(
      handshake,
      "INVALID_COMMAND",
      "A non-blank idempotency key, command digest and non-negative expected version are required.",
    );
  }

  const previous = handshake.processedCommands.find(
    (processed) => processed.idempotencyKey === envelope.idempotencyKey,
  );
  if (previous !== undefined) {
    if (previous.commandDigest !== envelope.commandDigest) {
      return rejected(
        handshake,
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used for a different command digest.",
      );
    }

    return {
      outcome: "DUPLICATE",
      handshake,
      events: [],
      originalResultingVersion: previous.resultingVersion,
    };
  }

  if (envelope.expectedVersion !== handshake.version) {
    return rejected(
      handshake,
      "VERSION_CONFLICT",
      `Expected version ${envelope.expectedVersion}, but aggregate is at version ${handshake.version}.`,
    );
  }

  if (isTerminalStatus(handshake.status)) {
    return rejected(
      handshake,
      "TERMINAL_STATE",
      `No new command may change terminal status ${handshake.status}.`,
    );
  }

  const handled = handleCommand(handshake, envelope.command);
  if ("rejection" in handled) {
    return rejected(handshake, handled.rejection.code, handled.rejection.message);
  }

  const nextVersion = handshake.version + 1;
  if (!Number.isSafeInteger(nextVersion)) {
    return rejected(handshake, "INVALID_AGGREGATE", "Version cannot be incremented safely.");
  }

  const processedCommand: ProcessedCommand = {
    idempotencyKey: envelope.idempotencyKey,
    commandDigest: envelope.commandDigest,
    resultingVersion: nextVersion,
  };
  const next: Handshake = {
    ...handled.handshake,
    version: nextVersion,
    processedCommands: [...handshake.processedCommands, processedCommand],
  };
  const outputViolations = validateHandshake(next);
  if (outputViolations.length > 0) {
    return rejected(
      handshake,
      "INVALID_AGGREGATE",
      `Command would violate aggregate invariants: ${outputViolations
        .map((violation) => `${violation.path}: ${violation.message}`)
        .join("; ")}`,
    );
  }

  return {
    outcome: "APPLIED",
    handshake: next,
    events: handled.events,
  };
}

interface HandledCommand {
  readonly handshake: Handshake;
  readonly events: readonly HandshakeDomainEvent[];
}

interface RejectedCommand {
  readonly rejection: CommandRejection;
}

function handleCommand(
  handshake: Handshake,
  command: HandshakeCommand,
): HandledCommand | RejectedCommand {
  switch (command.type) {
    case "ADVANCE":
      return advance(handshake, command.to);
    case "RECORD_ROUND":
      return recordRound(handshake, command.questions, command.tokens, command.costMicros);
    case "REQUEST_OWNER":
      return requestOwner(handshake, command.participantId, command.questionId, command.reason);
    case "RESOLVE_OWNER_REQUEST":
      return resolveOwnerRequest(
        handshake,
        command.participantId,
        command.questionId,
        command.resolution,
      );
    case "SUBMIT_PROPOSAL":
      return submitProposal(handshake, command.participantId);
    case "SUBMIT_CONSENT":
      return submitConsent(
        handshake,
        command.participantId,
        command.decision,
        command.consentVersion,
      );
    case "TERMINATE":
      return terminate(handshake, command.to, command.code);
    case "DISPUTE":
      return dispute(handshake);
    default:
      return commandRejected("INVALID_COMMAND", "Unknown handshake command type.");
  }
}

function advance(handshake: Handshake, to: HandshakeStatus): HandledCommand | RejectedCommand {
  if (!isHandshakeStatus(to) || !canTransition(handshake.status, to)) {
    return commandRejected(
      "INVALID_TRANSITION",
      `Transition ${handshake.status} -> ${String(to)} is not allowed.`,
    );
  }

  if (
    to === "WAITING_OWNER" ||
    handshake.status === "WAITING_OWNER" ||
    (handshake.status === "SCREENING" && to === "PROPOSAL") ||
    (handshake.status === "PROPOSAL" && to === "WAITING_DUAL_CONSENT") ||
    (handshake.status === "WAITING_DUAL_CONSENT" &&
      (to === "NO_MATCH" || to === "REVEALED" || to === "CLARIFYING")) ||
    to === "DISPUTED" ||
    abnormalTerminationSet.has(to)
  ) {
    return commandRejected(
      "SPECIALIZED_COMMAND_REQUIRED",
      `Transition ${handshake.status} -> ${to} requires its specialized domain command.`,
    );
  }

  const termination =
    to === "REJECTED"
      ? ({ status: "REJECTED", code: "HARD_CONFLICT" } as const)
      : handshake.termination;

  return statusChange(
    handshake,
    to,
    {
      ...handshake,
      status: to,
      termination,
    },
    to === "REJECTED"
      ? [{ type: "HANDSHAKE_TERMINATED", status: "REJECTED", code: "HARD_CONFLICT" }]
      : [],
  );
}

function submitProposal(
  handshake: Handshake,
  participantId: string,
): HandledCommand | RejectedCommand {
  if (handshake.status !== "SCREENING" && handshake.status !== "PROPOSAL") {
    return commandRejected(
      "INVALID_TRANSITION",
      `Proposals can only be submitted during SCREENING or PROPOSAL, not ${handshake.status}.`,
    );
  }
  if (!handshake.participantIds.includes(participantId)) {
    return commandRejected("INVALID_PARTICIPANT", "Proposal participant is not in this handshake.");
  }
  if (handshake.proposalParticipantIds.includes(participantId)) {
    return commandRejected(
      "PROPOSAL_ALREADY_SUBMITTED",
      "This participant already submitted the current proposal.",
    );
  }

  if (handshake.status === "SCREENING") {
    return {
      handshake: {
        ...handshake,
        status: "PROPOSAL",
        proposalParticipantIds: [participantId],
      },
      events: [
        { type: "PROPOSAL_SUBMITTED", participantId, submittedCount: 1 },
        { type: "HANDSHAKE_STATUS_CHANGED", from: "SCREENING", to: "PROPOSAL" },
      ],
    };
  }

  const proposalParticipantIds = [...handshake.proposalParticipantIds, participantId];
  const consentCycle = handshake.consentCycle + 1;
  return {
    handshake: {
      ...handshake,
      status: "WAITING_DUAL_CONSENT",
      proposalParticipantIds,
      consentCycle,
      dualConsent: createPendingConsent(handshake.participantIds, consentCycle),
    },
    events: [
      { type: "PROPOSAL_SUBMITTED", participantId, submittedCount: 2 },
      {
        type: "HANDSHAKE_STATUS_CHANGED",
        from: "PROPOSAL",
        to: "WAITING_DUAL_CONSENT",
      },
    ],
  };
}

function recordRound(
  handshake: Handshake,
  questions: number,
  tokens: number,
  costMicros: number,
): HandledCommand | RejectedCommand {
  if (handshake.status !== "SCREENING" && handshake.status !== "CLARIFYING") {
    return commandRejected(
      "INVALID_TRANSITION",
      `Rounds can only be recorded during SCREENING or CLARIFYING, not ${handshake.status}.`,
    );
  }

  if (
    !isNonNegativeSafeInteger(questions) ||
    !isNonNegativeSafeInteger(tokens) ||
    !isNonNegativeSafeInteger(costMicros) ||
    (questions === 0 && tokens === 0 && costMicros === 0)
  ) {
    return commandRejected(
      "INVALID_ROUND_USAGE",
      "Round usage must contain non-negative safe integers and cannot be an empty no-op.",
    );
  }

  const limits = handshake.budget.limits;
  const usage = handshake.budget.usage;
  if (usage.rounds + 1 > limits.maxRounds) {
    return commandRejected("ROUND_LIMIT_EXCEEDED", "The round limit would be exceeded.");
  }
  if (questions > limits.maxQuestionsPerRound) {
    return commandRejected(
      "QUESTION_LIMIT_EXCEEDED",
      "The per-round question limit would be exceeded.",
    );
  }
  if (usage.tokens + tokens > limits.maxTokens) {
    return commandRejected("TOKEN_BUDGET_EXCEEDED", "The token budget would be exceeded.");
  }
  if (usage.costMicros + costMicros > limits.maxCostMicros) {
    return commandRejected("COST_BUDGET_EXCEEDED", "The cost budget would be exceeded.");
  }

  const nextRound = usage.rounds + 1;
  return {
    handshake: {
      ...handshake,
      budget: {
        limits,
        usage: {
          rounds: nextRound,
          questions: usage.questions + questions,
          tokens: usage.tokens + tokens,
          costMicros: usage.costMicros + costMicros,
        },
      },
    },
    events: [
      {
        type: "ROUND_RECORDED",
        round: nextRound,
        questions,
        tokens,
        costMicros,
      },
    ],
  };
}

function requestOwner(
  handshake: Handshake,
  participantId: string,
  questionId: string,
  reason: string,
): HandledCommand | RejectedCommand {
  if (handshake.status !== "SCREENING" && handshake.status !== "CLARIFYING") {
    return commandRejected(
      "INVALID_TRANSITION",
      `OWNER_REQUIRED can only pause SCREENING or CLARIFYING, not ${handshake.status}.`,
    );
  }
  if (!handshake.participantIds.includes(participantId)) {
    return commandRejected("INVALID_PARTICIPANT", "Owner participant is not in this handshake.");
  }
  if (!isNonBlank(questionId) || !isNonBlank(reason)) {
    return commandRejected(
      "INVALID_OWNER_REQUEST",
      "Owner question id and reason must not be blank.",
    );
  }

  const from = handshake.status;
  return {
    handshake: {
      ...handshake,
      status: "WAITING_OWNER",
      ownerPause: {
        participantId,
        questionId,
        reason,
        resumeStatus: from,
      },
    },
    events: [
      { type: "HANDSHAKE_STATUS_CHANGED", from, to: "WAITING_OWNER" },
      { type: "OWNER_REQUIRED", participantId, questionId, resumeStatus: from },
    ],
  };
}

function resolveOwnerRequest(
  handshake: Handshake,
  participantId: string,
  questionId: string,
  resolution: "ANSWERED" | "DECLINED" | "TERMINATED",
): HandledCommand | RejectedCommand {
  if (handshake.status !== "WAITING_OWNER" || handshake.ownerPause === null) {
    return commandRejected("INVALID_TRANSITION", "There is no paused owner request to resolve.");
  }
  if (
    handshake.ownerPause.participantId !== participantId ||
    handshake.ownerPause.questionId !== questionId
  ) {
    return commandRejected(
      "INVALID_OWNER_REQUEST",
      "The resolution does not match the active owner request.",
    );
  }
  if (!ownerResolutionSet.has(resolution)) {
    return commandRejected("INVALID_COMMAND", "Unknown owner request resolution.");
  }

  const resolutionEvent: HandshakeDomainEvent = {
    type: "OWNER_REQUEST_RESOLVED",
    participantId,
    questionId,
    resolution,
  };
  if (resolution === "ANSWERED") {
    const to = handshake.ownerPause.resumeStatus;
    return {
      handshake: {
        ...handshake,
        status: to,
        ownerPause: null,
      },
      events: [resolutionEvent, { type: "HANDSHAKE_STATUS_CHANGED", from: "WAITING_OWNER", to }],
    };
  }

  const to = resolution === "DECLINED" ? "REJECTED" : "CANCELLED";
  const code = resolution === "DECLINED" ? "OWNER_DECLINED" : "USER_CANCELLED";
  return {
    handshake: {
      ...handshake,
      status: to,
      ownerPause: null,
      termination: { status: to, code },
    },
    events: [
      resolutionEvent,
      { type: "HANDSHAKE_STATUS_CHANGED", from: "WAITING_OWNER", to },
      { type: "HANDSHAKE_TERMINATED", status: to, code },
    ],
  };
}

function submitConsent(
  handshake: Handshake,
  participantId: string,
  decision: Exclude<ConsentDecision, "PENDING">,
  consentVersion: string,
): HandledCommand | RejectedCommand {
  if (handshake.status !== "WAITING_DUAL_CONSENT" || handshake.dualConsent === null) {
    return commandRejected(
      "INVALID_TRANSITION",
      "Owner consent can only be submitted while waiting for dual consent.",
    );
  }
  if (!handshake.participantIds.includes(participantId)) {
    return commandRejected("INVALID_PARTICIPANT", "Consent participant is not in this handshake.");
  }
  if (!submittedConsentDecisionSet.has(decision)) {
    return commandRejected("INVALID_COMMAND", "Unknown owner consent decision.");
  }
  if (!isNonBlank(consentVersion)) {
    return commandRejected("INVALID_COMMAND", "Consent version must not be blank.");
  }

  const decisionIndex = handshake.dualConsent.decisions.findIndex(
    (entry) => entry.participantId === participantId,
  );
  const previousDecision = handshake.dualConsent.decisions[decisionIndex];
  if (decisionIndex < 0 || previousDecision === undefined) {
    return commandRejected("INVALID_AGGREGATE", "Consent participant slots are inconsistent.");
  }
  if (previousDecision.decision !== "PENDING") {
    return commandRejected(
      "OWNER_DECISION_ALREADY_RECORDED",
      "This participant already submitted a decision in the current consent cycle.",
    );
  }

  if (
    handshake.dualConsent.consentVersion !== null &&
    handshake.dualConsent.consentVersion !== consentVersion
  ) {
    return commandRejected(
      "CONSENT_VERSION_MISMATCH",
      `Consent version ${consentVersion} does not match the version already accepted in this cycle.`,
    );
  }

  const updatedDecision: ParticipantConsent = { participantId, decision };
  const decisions: [ParticipantConsent, ParticipantConsent] = [
    handshake.dualConsent.decisions[0],
    handshake.dualConsent.decisions[1],
  ];
  decisions[decisionIndex] = updatedDecision;
  const boundConsentVersion = handshake.dualConsent.consentVersion ?? consentVersion;
  const dualConsent: DualConsent = {
    ...handshake.dualConsent,
    consentVersion: boundConsentVersion,
    decisions,
  };
  const decisionEvent: HandshakeDomainEvent = {
    type: "OWNER_DECISION_RECORDED",
    participantId,
    decision,
    consentVersion,
    cycle: dualConsent.cycle,
  };

  if (decision === "DECLINE") {
    return {
      handshake: {
        ...handshake,
        status: "NO_MATCH",
        dualConsent,
        termination: { status: "NO_MATCH", code: "OWNER_DECLINED" },
      },
      events: [
        decisionEvent,
        {
          type: "HANDSHAKE_STATUS_CHANGED",
          from: "WAITING_DUAL_CONSENT",
          to: "NO_MATCH",
        },
        { type: "HANDSHAKE_TERMINATED", status: "NO_MATCH", code: "OWNER_DECLINED" },
      ],
    };
  }

  if (decision === "MORE_INFO") {
    return {
      handshake: {
        ...handshake,
        status: "CLARIFYING",
        proposalParticipantIds: [],
        dualConsent,
      },
      events: [
        decisionEvent,
        {
          type: "HANDSHAKE_STATUS_CHANGED",
          from: "WAITING_DUAL_CONSENT",
          to: "CLARIFYING",
        },
      ],
    };
  }

  if (decisions.every((entry) => entry.decision === "CONTINUE")) {
    return {
      handshake: {
        ...handshake,
        status: "REVEALED",
        dualConsent,
      },
      events: [
        decisionEvent,
        {
          type: "DUAL_CONSENT_REACHED",
          cycle: dualConsent.cycle,
          consentVersion: boundConsentVersion,
        },
        {
          type: "HANDSHAKE_STATUS_CHANGED",
          from: "WAITING_DUAL_CONSENT",
          to: "REVEALED",
        },
      ],
    };
  }

  return {
    handshake: { ...handshake, dualConsent },
    events: [decisionEvent],
  };
}

function validateProposalParticipants(
  handshake: Handshake,
  add: (path: string, message: string) => void,
): void {
  if (!Array.isArray(handshake.proposalParticipantIds)) {
    add("proposalParticipantIds", "Proposal participant progress must be an array.");
    return;
  }

  const uniqueIds = new Set(handshake.proposalParticipantIds);
  if (
    handshake.proposalParticipantIds.length > 2 ||
    uniqueIds.size !== handshake.proposalParticipantIds.length ||
    handshake.proposalParticipantIds.some(
      (participantId) => !handshake.participantIds.includes(participantId),
    )
  ) {
    add(
      "proposalParticipantIds",
      "Proposal progress may contain each handshake participant at most once.",
    );
  }

  const submittedCount = handshake.proposalParticipantIds.length;
  if (handshake.status === "PROPOSAL" && submittedCount !== 1) {
    add("proposalParticipantIds", "PROPOSAL requires exactly one submitted participant.");
  }

  const requiresBoth =
    handshake.status === "WAITING_DUAL_CONSENT" ||
    handshake.status === "NO_MATCH" ||
    handshake.status === "REVEALED" ||
    handshake.status === "INTRODUCED" ||
    handshake.status === "FEEDBACK_COMPLETE" ||
    handshake.status === "DISPUTED";
  if (requiresBoth && submittedCount !== 2) {
    add("proposalParticipantIds", `${handshake.status} requires both proposal participants.`);
  }

  const requiresNone =
    handshake.status === "DRAFT" ||
    handshake.status === "READY" ||
    handshake.status === "DISCOVERING" ||
    handshake.status === "CANDIDATE_FOUND" ||
    handshake.status === "OWNER_AUTHORIZED" ||
    handshake.status === "SCREENING" ||
    handshake.status === "WAITING_OWNER" ||
    handshake.status === "CLARIFYING" ||
    handshake.status === "REJECTED";
  if (requiresNone && submittedCount !== 0) {
    add("proposalParticipantIds", `${handshake.status} cannot carry proposal progress.`);
  }
}

function terminate(
  handshake: Handshake,
  to: AbnormalTerminationStatus,
  code: TerminationCode,
): HandledCommand | RejectedCommand {
  if (!abnormalTerminationSet.has(to) || !canTransition(handshake.status, to)) {
    return commandRejected(
      "INVALID_TRANSITION",
      `Abnormal termination ${handshake.status} -> ${String(to)} is not allowed.`,
    );
  }
  if (!isValidTerminationPair(to, code)) {
    return commandRejected("INVALID_COMMAND", `${String(code)} is not valid for ${String(to)}.`);
  }

  return {
    handshake: {
      ...handshake,
      status: to,
      ownerPause: null,
      termination: { status: to, code },
    },
    events: [
      { type: "HANDSHAKE_STATUS_CHANGED", from: handshake.status, to },
      { type: "HANDSHAKE_TERMINATED", status: to, code },
    ],
  };
}

function dispute(handshake: Handshake): HandledCommand | RejectedCommand {
  if (handshake.status !== "REVEALED" && handshake.status !== "INTRODUCED") {
    return commandRejected(
      "INVALID_TRANSITION",
      `Only REVEALED or INTRODUCED handshakes can be disputed, not ${handshake.status}.`,
    );
  }

  return {
    handshake: {
      ...handshake,
      status: "DISPUTED",
      termination: { status: "DISPUTED", code: "DISPUTED" },
    },
    events: [
      { type: "HANDSHAKE_STATUS_CHANGED", from: handshake.status, to: "DISPUTED" },
      { type: "HANDSHAKE_TERMINATED", status: "DISPUTED", code: "DISPUTED" },
    ],
  };
}

function statusChange(
  previous: Handshake,
  to: HandshakeStatus,
  next: Handshake,
  additionalEvents: readonly HandshakeDomainEvent[],
): HandledCommand {
  return {
    handshake: next,
    events: [{ type: "HANDSHAKE_STATUS_CHANGED", from: previous.status, to }, ...additionalEvents],
  };
}

function createPendingConsent(
  participantIds: readonly [string, string],
  cycle: number,
): DualConsent {
  return {
    cycle,
    consentVersion: null,
    decisions: [
      { participantId: participantIds[0], decision: "PENDING" },
      { participantId: participantIds[1], decision: "PENDING" },
    ],
  };
}

function validateDualConsent(
  handshake: Handshake,
  add: (path: string, message: string) => void,
): void {
  if (handshake.status === "WAITING_DUAL_CONSENT" && handshake.dualConsent === null) {
    add("dualConsent", "WAITING_DUAL_CONSENT requires consent context.");
    return;
  }
  if (handshake.dualConsent === null) {
    if (handshake.status === "REVEALED") {
      add("dualConsent", "REVEALED requires proof of dual consent.");
    }
    return;
  }

  if (handshake.dualConsent.cycle <= 0 || handshake.dualConsent.cycle !== handshake.consentCycle) {
    add("dualConsent.cycle", "Consent context must match the current positive consent cycle.");
  }
  const hasSubmittedDecision = handshake.dualConsent.decisions.some(
    (entry) => entry.decision !== "PENDING",
  );
  if (
    handshake.dualConsent.consentVersion !== null &&
    !isNonBlank(handshake.dualConsent.consentVersion)
  ) {
    add("dualConsent.consentVersion", "Consent version must be null or non-blank.");
  }
  if (hasSubmittedDecision && handshake.dualConsent.consentVersion === null) {
    add("dualConsent.consentVersion", "A submitted owner decision must bind a consent version.");
  }
  if (!hasSubmittedDecision && handshake.dualConsent.consentVersion !== null) {
    add("dualConsent.consentVersion", "Pending owner decisions cannot bind a consent version yet.");
  }
  const ids = handshake.dualConsent.decisions.map((entry) => entry.participantId);
  if (
    ids.length !== 2 ||
    ids[0] !== handshake.participantIds[0] ||
    ids[1] !== handshake.participantIds[1]
  ) {
    add("dualConsent.decisions", "Consent slots must match both participants in stable order.");
  }
  for (const [index, entry] of handshake.dualConsent.decisions.entries()) {
    if (!consentDecisionSet.has(entry.decision)) {
      add(`dualConsent.decisions.${index}.decision`, "Unknown owner consent decision.");
    }
  }
  if (
    handshake.status === "WAITING_DUAL_CONSENT" &&
    handshake.dualConsent.decisions.some(
      (entry) => entry.decision === "DECLINE" || entry.decision === "MORE_INFO",
    )
  ) {
    add("dualConsent.decisions", "Decline and more-info decisions must immediately leave waiting.");
  }
  if (
    handshake.status === "REVEALED" &&
    !handshake.dualConsent.decisions.every((entry) => entry.decision === "CONTINUE")
  ) {
    add("dualConsent.decisions", "REVEALED requires both participants to continue.");
  }
  if (
    handshake.status === "NO_MATCH" &&
    !handshake.dualConsent.decisions.some((entry) => entry.decision === "DECLINE")
  ) {
    add("dualConsent.decisions", "NO_MATCH requires an owner decline decision.");
  }
}

function validateTermination(
  handshake: Handshake,
  add: (path: string, message: string) => void,
): void {
  const requiresTermination =
    handshake.status === "REJECTED" ||
    handshake.status === "NO_MATCH" ||
    handshake.status === "CANCELLED" ||
    handshake.status === "EXPIRED" ||
    handshake.status === "POLICY_BLOCKED" ||
    handshake.status === "FAILED" ||
    handshake.status === "DISPUTED";

  if (requiresTermination && handshake.termination === null) {
    add("termination", `${handshake.status} requires termination context.`);
  }
  if (!terminalStatusSet.has(handshake.status) && handshake.termination !== null) {
    add("termination", "Active handshakes cannot carry termination context.");
  }
  if (handshake.termination !== null && handshake.termination.status !== handshake.status) {
    add("termination.status", "Termination status must equal aggregate status.");
  }
  if (
    handshake.termination !== null &&
    (!terminationCodeSet.has(handshake.termination.code) ||
      !isValidTerminationPair(handshake.termination.status, handshake.termination.code))
  ) {
    add("termination.code", "Termination code is not valid for the terminal status.");
  }
}

function validateProcessedCommands(
  handshake: Handshake,
  add: (path: string, message: string) => void,
): void {
  const ids = new Set<string>();
  for (const [index, command] of handshake.processedCommands.entries()) {
    if (!isNonBlank(command.idempotencyKey) || !isNonBlank(command.commandDigest)) {
      add(`processedCommands.${index}`, "Processed command identifiers must not be blank.");
    }
    if (ids.has(command.idempotencyKey)) {
      add(`processedCommands.${index}.idempotencyKey`, "Processed command keys must be unique.");
    }
    ids.add(command.idempotencyKey);
    if (
      !isNonNegativeSafeInteger(command.resultingVersion) ||
      command.resultingVersion > handshake.version
    ) {
      add(
        `processedCommands.${index}.resultingVersion`,
        "Processed command version must be valid and no newer than the aggregate.",
      );
    }
  }
}

function assertCreationInput(input: CreateHandshakeInput): void {
  const messages: string[] = [];
  if (!isNonBlank(input.id)) {
    messages.push("Handshake id must not be blank.");
  }
  if (!isNonBlank(input.communityId)) {
    messages.push("Community id must not be blank.");
  }
  if (!isNonBlank(input.scene)) {
    messages.push("Scene must not be blank.");
  }
  if (!isNonBlank(input.purpose)) {
    messages.push("Purpose must not be blank.");
  }
  if (
    input.participantIds.length !== 2 ||
    !input.participantIds.every(isNonBlank) ||
    input.participantIds[0] === input.participantIds[1]
  ) {
    messages.push("Exactly two distinct, non-blank participants are required.");
  }
  validateLimits(input.budgetLimits, (_path, message) => messages.push(message));
  if (messages.length > 0) {
    throw new HandshakeDomainError(messages.join(" "));
  }
}

function validateLimits(
  limits: HandshakeBudgetLimits,
  add: (path: string, message: string) => void,
): void {
  for (const [key, value] of Object.entries(limits)) {
    if (!isPositiveSafeInteger(value)) {
      add(`budget.limits.${key}`, "Budget limits must be positive safe integers.");
    }
  }
}

function commandRejected(code: CommandRejectionCode, message: string): RejectedCommand {
  return { rejection: { code, message } };
}

function rejected(
  handshake: Handshake,
  code: CommandRejectionCode,
  message: string,
): HandshakeCommandResult {
  return {
    outcome: "REJECTED",
    handshake,
    events: [],
    rejection: { code, message },
  };
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isValidTerminationPair(status: TerminalHandshakeStatus, code: TerminationCode): boolean {
  switch (status) {
    case "REJECTED":
      return code === "HARD_CONFLICT" || code === "OWNER_DECLINED" || code === "LOW_CONFIDENCE";
    case "NO_MATCH":
      return code === "OWNER_DECLINED";
    case "FEEDBACK_COMPLETE":
      return false;
    case "CANCELLED":
      return code === "USER_CANCELLED";
    case "EXPIRED":
      return code === "TIMEOUT";
    case "POLICY_BLOCKED":
      return code === "POLICY_BLOCKED";
    case "FAILED":
      return code === "SYSTEM_FAILURE" || code === "BUDGET_EXHAUSTED" || code === "LOW_CONFIDENCE";
    case "DISPUTED":
      return code === "DISPUTED";
  }
}
