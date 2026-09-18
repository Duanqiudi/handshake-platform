import type { Handshake } from "@handshake/domain";
import { assertHspMessage, type HspMessage } from "@handshake/hsp-contracts";

const DEFAULT_VALIDATION_CLOCK = new Date("2026-09-14T08:01:00.000Z");

export const SIMULATION_BOUNDARY_CODES = [
  "HANDSHAKE_MISMATCH",
  "COMMUNITY_MISMATCH",
  "PARTICIPANT_MISMATCH",
  "STALE_STATE_VERSION",
  "EXPECTED_STATUS_MISMATCH",
] as const;

export type SimulationBoundaryCode = (typeof SIMULATION_BOUNDARY_CODES)[number];

export class SimulationBoundaryError extends Error {
  public constructor(
    public readonly code: SimulationBoundaryCode,
    message: string,
  ) {
    super(message);
    this.name = "SimulationBoundaryError";
  }
}

export function validateMessageForHandshake(
  handshake: Handshake,
  input: unknown,
  now: Date = DEFAULT_VALIDATION_CLOCK,
): HspMessage {
  const message = assertHspMessage(input, { now });
  validateMessageScopeForHandshake(handshake, message);
  validateMessageStateForHandshake(handshake, message);
  return message;
}

/** Validates tenant and participant scope before replay-cache lookup to avoid an id oracle. */
export function validateMessageScopeForHandshake(
  handshake: Handshake,
  message: HspMessage,
): HspMessage {
  if (message.handshake_id !== handshake.id) {
    throw new SimulationBoundaryError(
      "HANDSHAKE_MISMATCH",
      `Message ${message.message_id} is not for handshake ${handshake.id}.`,
    );
  }
  if (message.community_id !== handshake.communityId) {
    throw new SimulationBoundaryError(
      "COMMUNITY_MISMATCH",
      `Message ${message.message_id} is outside community ${handshake.communityId}.`,
    );
  }
  if (
    message.sender_endpoint_id === message.recipient_endpoint_id ||
    !handshake.participantIds.includes(message.sender_endpoint_id) ||
    !handshake.participantIds.includes(message.recipient_endpoint_id)
  ) {
    throw new SimulationBoundaryError(
      "PARTICIPANT_MISMATCH",
      `Message ${message.message_id} is not between the registered endpoints.`,
    );
  }
  return message;
}

/** Validates optimistic state only after message scope and replay checks have succeeded. */
export function validateMessageStateForHandshake(
  handshake: Handshake,
  message: HspMessage,
): HspMessage {
  if (message.state_version !== handshake.version) {
    throw new SimulationBoundaryError(
      "STALE_STATE_VERSION",
      `Message ${message.message_id} expected version ${message.state_version}; current version is ${handshake.version}.`,
    );
  }
  if (message.expected_status !== undefined && message.expected_status !== handshake.status) {
    throw new SimulationBoundaryError(
      "EXPECTED_STATUS_MISMATCH",
      `Message ${message.message_id} expected ${message.expected_status}; current status is ${handshake.status}.`,
    );
  }
  return message;
}
