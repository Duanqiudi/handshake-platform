/**
 * Domain-owned copies of the HSP 0.2 state strings.
 *
 * This package intentionally does not import the wire-contract package. The application
 * composition layer is responsible for mapping compatible contract values into this model.
 */
export const HANDSHAKE_STATUSES = [
  "DRAFT",
  "READY",
  "DISCOVERING",
  "CANDIDATE_FOUND",
  "OWNER_AUTHORIZED",
  "SCREENING",
  "WAITING_OWNER",
  "CLARIFYING",
  "REJECTED",
  "PROPOSAL",
  "WAITING_DUAL_CONSENT",
  "NO_MATCH",
  "REVEALED",
  "INTRODUCED",
  "FEEDBACK_COMPLETE",
  "CANCELLED",
  "EXPIRED",
  "POLICY_BLOCKED",
  "FAILED",
  "DISPUTED",
] as const;

export type HandshakeStatus = (typeof HANDSHAKE_STATUSES)[number];

export const TERMINAL_HANDSHAKE_STATUSES = [
  "REJECTED",
  "NO_MATCH",
  "FEEDBACK_COMPLETE",
  "CANCELLED",
  "EXPIRED",
  "POLICY_BLOCKED",
  "FAILED",
  "DISPUTED",
] as const satisfies readonly HandshakeStatus[];

export type TerminalHandshakeStatus = (typeof TERMINAL_HANDSHAKE_STATUSES)[number];

export const ABNORMAL_TERMINATION_STATUSES = [
  "CANCELLED",
  "EXPIRED",
  "POLICY_BLOCKED",
  "FAILED",
] as const satisfies readonly TerminalHandshakeStatus[];

export type AbnormalTerminationStatus = (typeof ABNORMAL_TERMINATION_STATUSES)[number];

export const HSP_STOP_CODES = [
  "SUCCESS_PROPOSAL",
  "HARD_CONFLICT",
  "ENOUGH_INFO",
  "HUMAN_REQUIRED",
  "NEED_OWNER",
  "OWNER_DECLINED",
  "BUDGET_EXHAUSTED",
  "POLICY_BLOCKED",
  "TIMEOUT",
  "LOW_CONFIDENCE",
] as const;

export type HspStopCode = (typeof HSP_STOP_CODES)[number];

export const TERMINATION_CODES = [
  ...HSP_STOP_CODES,
  "USER_CANCELLED",
  "SYSTEM_FAILURE",
  "DISPUTED",
] as const;

export type TerminationCode = (typeof TERMINATION_CODES)[number];

export interface HandshakeBudgetLimits {
  readonly maxRounds: number;
  readonly maxQuestionsPerRound: number;
  readonly maxTokens: number;
  /** Integer micro-units of the configured billing currency. */
  readonly maxCostMicros: number;
}

export interface HandshakeBudgetUsage {
  readonly rounds: number;
  readonly questions: number;
  readonly tokens: number;
  /** Integer micro-units of the configured billing currency. */
  readonly costMicros: number;
}

export interface HandshakeBudget {
  readonly limits: HandshakeBudgetLimits;
  readonly usage: HandshakeBudgetUsage;
}

export type ResumableHandshakeStatus = "SCREENING" | "CLARIFYING";

export interface OwnerPause {
  readonly participantId: string;
  readonly questionId: string;
  readonly reason: string;
  readonly resumeStatus: ResumableHandshakeStatus;
}

export type ConsentDecision = "PENDING" | "CONTINUE" | "DECLINE" | "MORE_INFO";

export interface ParticipantConsent {
  readonly participantId: string;
  readonly decision: ConsentDecision;
}

export interface DualConsent {
  readonly cycle: number;
  /** Shared consent-version identifier reported by both owners in this cycle. */
  readonly consentVersion: string | null;
  readonly decisions: readonly [ParticipantConsent, ParticipantConsent];
}

export interface HandshakeTermination {
  readonly status: TerminalHandshakeStatus;
  readonly code: TerminationCode;
}

export interface ProcessedCommand {
  readonly idempotencyKey: string;
  /**
   * An opaque digest produced by the trusted command boundary. Keeping the payload out of the
   * aggregate avoids retaining owner questions or other potentially sensitive command content.
   */
  readonly commandDigest: string;
  readonly resultingVersion: number;
}

export interface Handshake {
  readonly id: string;
  /** Immutable tenant boundary selected when the aggregate is created. */
  readonly communityId: string;
  /** Immutable policy/evaluation scene selected when the aggregate is created. */
  readonly scene: string;
  /** Immutable purpose limitation selected when the aggregate is created. */
  readonly purpose: string;
  readonly participantIds: readonly [string, string];
  /**
   * Participants that submitted the current proposal, in submission order.
   *
   * Proposal content deliberately stays outside the aggregate; this durable progress marker is
   * sufficient for enforcing the two-party proposal barrier after rehydration.
   */
  readonly proposalParticipantIds: readonly string[];
  readonly status: HandshakeStatus;
  /** Monotonically increasing optimistic-concurrency version. */
  readonly version: number;
  readonly budget: HandshakeBudget;
  readonly ownerPause: OwnerPause | null;
  readonly consentCycle: number;
  readonly dualConsent: DualConsent | null;
  readonly termination: HandshakeTermination | null;
  readonly processedCommands: readonly ProcessedCommand[];
}

export interface CreateHandshakeInput {
  readonly id: string;
  readonly communityId: string;
  readonly scene: string;
  readonly purpose: string;
  readonly participantIds: readonly [string, string];
  readonly budgetLimits: HandshakeBudgetLimits;
}

export const OWNER_RESOLUTIONS = ["ANSWERED", "DECLINED", "TERMINATED"] as const;

export type OwnerResolution = (typeof OWNER_RESOLUTIONS)[number];

export type HandshakeCommand =
  | {
      readonly type: "ADVANCE";
      readonly to: HandshakeStatus;
    }
  | {
      readonly type: "RECORD_ROUND";
      readonly questions: number;
      readonly tokens: number;
      readonly costMicros: number;
    }
  | {
      readonly type: "REQUEST_OWNER";
      readonly participantId: string;
      readonly questionId: string;
      readonly reason: string;
    }
  | {
      readonly type: "RESOLVE_OWNER_REQUEST";
      readonly participantId: string;
      readonly questionId: string;
      readonly resolution: OwnerResolution;
    }
  | {
      readonly type: "SUBMIT_PROPOSAL";
      readonly participantId: string;
    }
  | {
      readonly type: "SUBMIT_CONSENT";
      readonly participantId: string;
      readonly decision: Exclude<ConsentDecision, "PENDING">;
      readonly consentVersion: string;
    }
  | {
      readonly type: "TERMINATE";
      readonly to: AbnormalTerminationStatus;
      readonly code: TerminationCode;
    }
  | {
      readonly type: "DISPUTE";
    };

export interface HandshakeCommandEnvelope {
  readonly idempotencyKey: string;
  /** Must be a stable digest of `command`, calculated and verified by the trusted boundary. */
  readonly commandDigest: string;
  readonly expectedVersion: number;
  readonly command: HandshakeCommand;
}

export type HandshakeDomainEvent =
  | {
      readonly type: "HANDSHAKE_STATUS_CHANGED";
      readonly from: HandshakeStatus;
      readonly to: HandshakeStatus;
    }
  | {
      readonly type: "ROUND_RECORDED";
      readonly round: number;
      readonly questions: number;
      readonly tokens: number;
      readonly costMicros: number;
    }
  | {
      readonly type: "OWNER_REQUIRED";
      readonly participantId: string;
      readonly questionId: string;
      readonly resumeStatus: ResumableHandshakeStatus;
    }
  | {
      readonly type: "OWNER_REQUEST_RESOLVED";
      readonly participantId: string;
      readonly questionId: string;
      readonly resolution: OwnerResolution;
    }
  | {
      readonly type: "PROPOSAL_SUBMITTED";
      readonly participantId: string;
      readonly submittedCount: 1 | 2;
    }
  | {
      readonly type: "OWNER_DECISION_RECORDED";
      readonly participantId: string;
      readonly decision: Exclude<ConsentDecision, "PENDING">;
      readonly consentVersion: string;
      readonly cycle: number;
    }
  | {
      readonly type: "DUAL_CONSENT_REACHED";
      readonly cycle: number;
      readonly consentVersion: string;
    }
  | {
      readonly type: "HANDSHAKE_TERMINATED";
      readonly status: TerminalHandshakeStatus;
      readonly code: TerminationCode;
    };

export const COMMAND_REJECTION_CODES = [
  "INVALID_AGGREGATE",
  "INVALID_COMMAND",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "TERMINAL_STATE",
  "INVALID_TRANSITION",
  "SPECIALIZED_COMMAND_REQUIRED",
  "INVALID_PARTICIPANT",
  "INVALID_OWNER_REQUEST",
  "PROPOSAL_ALREADY_SUBMITTED",
  "OWNER_DECISION_ALREADY_RECORDED",
  "CONSENT_VERSION_MISMATCH",
  "INVALID_ROUND_USAGE",
  "ROUND_LIMIT_EXCEEDED",
  "QUESTION_LIMIT_EXCEEDED",
  "TOKEN_BUDGET_EXCEEDED",
  "COST_BUDGET_EXCEEDED",
] as const;

export type CommandRejectionCode = (typeof COMMAND_REJECTION_CODES)[number];

export interface CommandRejection {
  readonly code: CommandRejectionCode;
  readonly message: string;
}

export type HandshakeCommandResult =
  | {
      readonly outcome: "APPLIED";
      readonly handshake: Handshake;
      readonly events: readonly HandshakeDomainEvent[];
    }
  | {
      readonly outcome: "DUPLICATE";
      readonly handshake: Handshake;
      readonly events: readonly [];
      readonly originalResultingVersion: number;
    }
  | {
      readonly outcome: "REJECTED";
      readonly handshake: Handshake;
      readonly events: readonly [];
      readonly rejection: CommandRejection;
    };

export interface HandshakeInvariantViolation {
  readonly path: string;
  readonly message: string;
}
