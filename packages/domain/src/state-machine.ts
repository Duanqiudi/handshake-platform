import type { HandshakeStatus, TerminalHandshakeStatus } from "./types.js";
import {
  ABNORMAL_TERMINATION_STATUSES,
  HANDSHAKE_STATUSES,
  TERMINAL_HANDSHAKE_STATUSES,
} from "./types.js";

const abnormal = ABNORMAL_TERMINATION_STATUSES;

/**
 * The public transition graph. Critical edges are still protected by specialized commands in
 * the aggregate handler (owner pause/resume, consent, dispute and abnormal termination).
 */
export const HANDSHAKE_TRANSITIONS = {
  DRAFT: ["READY", ...abnormal],
  READY: ["DISCOVERING", ...abnormal],
  DISCOVERING: ["CANDIDATE_FOUND", ...abnormal],
  CANDIDATE_FOUND: ["OWNER_AUTHORIZED", ...abnormal],
  OWNER_AUTHORIZED: ["SCREENING", ...abnormal],
  SCREENING: ["WAITING_OWNER", "CLARIFYING", "REJECTED", "PROPOSAL", ...abnormal],
  WAITING_OWNER: ["SCREENING", "CLARIFYING", "REJECTED", ...abnormal],
  CLARIFYING: ["SCREENING", "WAITING_OWNER", ...abnormal],
  REJECTED: [],
  PROPOSAL: ["WAITING_DUAL_CONSENT", ...abnormal],
  WAITING_DUAL_CONSENT: ["NO_MATCH", "REVEALED", "CLARIFYING", ...abnormal],
  NO_MATCH: [],
  REVEALED: ["INTRODUCED", "DISPUTED", ...abnormal],
  INTRODUCED: ["FEEDBACK_COMPLETE", "DISPUTED", ...abnormal],
  FEEDBACK_COMPLETE: [],
  CANCELLED: [],
  EXPIRED: [],
  POLICY_BLOCKED: [],
  FAILED: [],
  DISPUTED: [],
} as const satisfies Readonly<Record<HandshakeStatus, readonly HandshakeStatus[]>>;

const statusSet = new Set<string>(HANDSHAKE_STATUSES);
const terminalStatusSet = new Set<HandshakeStatus>(TERMINAL_HANDSHAKE_STATUSES);

export function isHandshakeStatus(value: unknown): value is HandshakeStatus {
  return typeof value === "string" && statusSet.has(value);
}

export function isTerminalStatus(status: HandshakeStatus): status is TerminalHandshakeStatus {
  return terminalStatusSet.has(status);
}

export function isActiveStatus(status: HandshakeStatus): boolean {
  return !isTerminalStatus(status);
}

export function allowedTransitionsFrom(status: HandshakeStatus): readonly HandshakeStatus[] {
  return HANDSHAKE_TRANSITIONS[status];
}

export function canTransition(from: HandshakeStatus, to: HandshakeStatus): boolean {
  return (HANDSHAKE_TRANSITIONS[from] as readonly HandshakeStatus[]).includes(to);
}
