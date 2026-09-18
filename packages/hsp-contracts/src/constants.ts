export const HSP_PROTOCOL = "hsp" as const;
export const HSP_PROTOCOL_VERSION = "0.2.0" as const;
export const HSP_PROTOCOL_LINE = "0.2" as const;

export const HSP_SCHEMA_VERSIONS = {
  agentCard: "agent-card-0.2",
  authorizationReceipt: "authorization-receipt-0.2",
  claimEnvelope: "claim-envelope-0.2",
  intentCapsule: "intent-capsule-0.2",
} as const;

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

const terminalStatusSet = new Set<HandshakeStatus>(TERMINAL_HANDSHAKE_STATUSES);

export function isTerminalHandshakeStatus(status: HandshakeStatus): boolean {
  return terminalStatusSet.has(status);
}

export const HSP_MESSAGE_TYPES = [
  "CAPABILITY_OFFER",
  "QUESTION",
  "CLAIM_RESPONSE",
  "EVIDENCE_REQUEST",
  "OWNER_REQUIRED",
  "CONFLICT_FOUND",
  "PROPOSAL",
  "OWNER_DECISION",
  "REVEAL_RECEIPT",
  "TERMINATE",
] as const;

export type HspMessageType = (typeof HSP_MESSAGE_TYPES)[number];

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

export const CLAIM_SOURCE_TYPES = [
  "owner_confirmed",
  "document_imported",
  "host_ai_summary",
  "inferred",
] as const;

export type ClaimSourceType = (typeof CLAIM_SOURCE_TYPES)[number];

export const CLAIM_CONFIDENCE_LEVELS = [
  "confirmed",
  "supported",
  "unverified",
  "disputed",
] as const;

export type ClaimConfidence = (typeof CLAIM_CONFIDENCE_LEVELS)[number];

export const SENSITIVITY_LEVELS = [
  "public",
  "professional",
  "private",
  "sensitive",
  "prohibited",
] as const;

export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];
