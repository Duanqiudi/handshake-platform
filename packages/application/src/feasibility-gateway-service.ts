import {
  applyHandshakeCommand,
  type CreateHandshakeInput,
  createHandshake,
  type Handshake,
  type HandshakeCommand,
  HandshakeDomainError,
  type HandshakeStatus,
} from "@handshake/domain";
import {
  assertHspMessage,
  type HspMessage,
  HspProtocolError,
  type OwnerDecisionMessage,
  type TerminateMessage,
} from "@handshake/hsp-contracts";
import { canonicalSha256 } from "./canonical-json.js";
import { ApplicationError } from "./errors.js";
import type { CommitMessageResult, HandshakeStore } from "./ports/handshake-store.js";

const SCREENING_BOOTSTRAP_STATUSES = [
  "READY",
  "DISCOVERING",
  "CANDIDATE_FOUND",
  "OWNER_AUTHORIZED",
  "SCREENING",
] as const satisfies readonly HandshakeStatus[];

export type CreateScreeningHandshakeInput = CreateHandshakeInput;

export interface HandshakeRoute {
  readonly communityId: string;
  readonly handshakeId: string;
}

export interface ReceiveMessageInput extends HandshakeRoute {
  readonly dto: unknown;
}

export interface ReceiveMessageResult {
  readonly handshake: Handshake;
  readonly message: HspMessage;
  readonly command: HandshakeCommand;
  readonly envelopeDigest: string;
  readonly commandDigest: string;
}

export interface FeasibilityGatewayServiceOptions {
  readonly store: HandshakeStore;
  readonly now?: () => Date;
}

/**
 * Small vertical-slice use cases for validating protocol/domain/persistence feasibility.
 * No web framework, database library, or model provider is allowed at this boundary.
 */
export class FeasibilityGatewayService {
  readonly #store: HandshakeStore;
  readonly #now: () => Date;

  public constructor(options: FeasibilityGatewayServiceOptions) {
    this.#store = options.store;
    this.#now = options.now ?? (() => new Date());
  }

  /**
   * Feasibility-only entry point. It keeps all legal domain transitions but skips executing real
   * discovery, candidate selection, and owner authorization workflows.
   */
  public async createScreeningHandshake(input: CreateScreeningHandshakeInput): Promise<Handshake> {
    let handshake: Handshake;
    try {
      handshake = createHandshake(input);
    } catch (error) {
      if (error instanceof HandshakeDomainError) {
        throw new ApplicationError({
          code: "INVALID_CREATE_INPUT",
          message: error.message,
          details: { domain_code: error.code },
          cause: error,
        });
      }
      throw error;
    }

    for (const status of SCREENING_BOOTSTRAP_STATUSES) {
      const command: HandshakeCommand = { type: "ADVANCE", to: status };
      const result = applyHandshakeCommand(handshake, {
        idempotencyKey: `feasibility-bootstrap:${handshake.id}:${status}`,
        commandDigest: canonicalSha256(command),
        expectedVersion: handshake.version,
        command,
      });
      if (result.outcome !== "APPLIED") {
        throw new ApplicationError({
          code: "DOMAIN_COMMAND_REJECTED",
          message: `Feasibility bootstrap failed while entering ${status}.`,
          handshakeId: handshake.id,
          details: {
            outcome: result.outcome,
            ...(result.outcome === "REJECTED" ? { domain_code: result.rejection.code } : {}),
          },
        });
      }
      handshake = result.handshake;
    }

    const created = await this.#store.create({ handshake });
    if (created === "ALREADY_EXISTS") {
      throw new ApplicationError({
        code: "HANDSHAKE_ALREADY_EXISTS",
        message: `Handshake ${handshake.id} already exists in community ${handshake.communityId}.`,
        handshakeId: handshake.id,
      });
    }
    return handshake;
  }

  public async getHandshake(route: HandshakeRoute): Promise<Handshake> {
    const handshake = await this.#store.find(route);
    if (handshake === null) {
      throw new ApplicationError({
        code: "HANDSHAKE_NOT_FOUND",
        message: `Handshake ${route.handshakeId} was not found in community ${route.communityId}.`,
        handshakeId: route.handshakeId,
      });
    }
    if (handshake.communityId !== route.communityId || handshake.id !== route.handshakeId) {
      throw new ApplicationError({
        code: "COMMUNITY_SCOPE_VIOLATION",
        message: "The store returned a handshake outside the requested community scope.",
        handshakeId: route.handshakeId,
      });
    }
    return handshake;
  }

  public async receiveMessage(input: ReceiveMessageInput): Promise<ReceiveMessageResult> {
    const now = this.#now();
    let message: HspMessage;
    try {
      message = assertHspMessage(input.dto, { now });
    } catch (error) {
      if (error instanceof HspProtocolError) {
        throw ApplicationError.fromHsp(error);
      }
      throw error;
    }

    assertRouteMatches(input, message);
    const handshake = await this.getHandshake(input);
    assertMessageScope(handshake, message);
    if (
      await this.#store.hasReplay({
        communityId: input.communityId,
        handshakeId: input.handshakeId,
        messageId: message.message_id,
        senderEndpointId: message.sender_endpoint_id,
        sequence: message.sequence,
        nonce: message.nonce,
      })
    ) {
      throw new ApplicationError({
        code: "REPLAY_DETECTED",
        message: "The message id, sender-scoped nonce, or sender sequence was already committed.",
        messageId: message.message_id,
        handshakeId: message.handshake_id,
      });
    }
    assertMessageState(handshake, message);

    const command = mapHspMessageToCommand(message);
    const envelopeDigest = canonicalSha256(message);
    const commandDigest = canonicalSha256(command);
    const fromStatus = handshake.status;
    const result = applyHandshakeCommand(handshake, {
      idempotencyKey: message.idempotency_key,
      commandDigest,
      expectedVersion: handshake.version,
      command,
    });

    if (result.outcome === "DUPLICATE") {
      throw new ApplicationError({
        code: "REPLAY_DETECTED",
        message: `Idempotency key ${message.idempotency_key} has already been processed.`,
        messageId: message.message_id,
        handshakeId: message.handshake_id,
      });
    }
    if (result.outcome === "REJECTED") {
      throw new ApplicationError({
        code: "DOMAIN_COMMAND_REJECTED",
        message: result.rejection.message,
        messageId: message.message_id,
        handshakeId: message.handshake_id,
        details: { domain_code: result.rejection.code },
      });
    }

    const commitResult = await this.#store.commitMessage({
      communityId: input.communityId,
      handshakeId: input.handshakeId,
      expectedVersion: handshake.version,
      nextHandshake: result.handshake,
      message: {
        messageId: message.message_id,
        senderEndpointId: message.sender_endpoint_id,
        sequence: message.sequence,
        nonce: message.nonce,
        envelopeDigest,
      },
      fromStatus,
      toStatus: result.handshake.status,
      occurredAt: now.toISOString(),
    });
    assertCommitApplied(commitResult, message);

    return {
      handshake: result.handshake,
      message,
      command,
      envelopeDigest,
      commandDigest,
    };
  }
}

/** Explicit and intentionally small anti-corruption mapping from wire DTOs to domain commands. */
export function mapHspMessageToCommand(message: HspMessage): HandshakeCommand {
  switch (message.type) {
    case "PROPOSAL": {
      if (
        message.payload.recommendation !== "continue" ||
        message.payload.stop_code !== "SUCCESS_PROPOSAL"
      ) {
        throw new ApplicationError({
          code: "DOMAIN_COMMAND_REJECTED",
          message: "The feasibility flow only accepts continue proposals with SUCCESS_PROPOSAL.",
          messageId: message.message_id,
          handshakeId: message.handshake_id,
          details: {
            recommendation: message.payload.recommendation,
            stop_code: message.payload.stop_code,
          },
        });
      }
      return { type: "SUBMIT_PROPOSAL", participantId: message.sender_endpoint_id };
    }
    case "OWNER_DECISION":
      return mapOwnerDecision(message);
    case "TERMINATE":
      return mapTermination(message);
    default:
      throw new ApplicationError({
        code: "UNSUPPORTED_MESSAGE_TYPE",
        message: `HSP message type ${message.type} does not map to a feasibility domain command.`,
        messageId: message.message_id,
        handshakeId: message.handshake_id,
      });
  }
}

function assertRouteMatches(route: HandshakeRoute, message: HspMessage): void {
  if (message.community_id !== route.communityId || message.handshake_id !== route.handshakeId) {
    throw new ApplicationError({
      code: "ROUTE_MISMATCH",
      message: "HSP envelope does not match the routed community and handshake.",
      messageId: message.message_id,
      handshakeId: message.handshake_id,
      details: {
        route_community_id: route.communityId,
        route_handshake_id: route.handshakeId,
      },
    });
  }
}

function assertMessageScope(handshake: Handshake, message: HspMessage): void {
  if (handshake.communityId !== message.community_id || handshake.id !== message.handshake_id) {
    throw new ApplicationError({
      code: "COMMUNITY_SCOPE_VIOLATION",
      message: "HSP envelope is outside the stored handshake scope.",
      messageId: message.message_id,
      handshakeId: message.handshake_id,
    });
  }
  if (
    message.sender_endpoint_id === message.recipient_endpoint_id ||
    !handshake.participantIds.includes(message.sender_endpoint_id) ||
    !handshake.participantIds.includes(message.recipient_endpoint_id)
  ) {
    throw new ApplicationError({
      code: "PARTICIPANT_SCOPE_VIOLATION",
      message: "Both distinct HSP endpoints must be participants in the handshake.",
      messageId: message.message_id,
      handshakeId: message.handshake_id,
    });
  }
}

function assertMessageState(handshake: Handshake, message: HspMessage): void {
  if (message.state_version !== handshake.version) {
    throw new ApplicationError({
      code: "CONCURRENT_MODIFICATION",
      message: `Message state version ${message.state_version} does not match ${handshake.version}.`,
      retryable: true,
      messageId: message.message_id,
      handshakeId: message.handshake_id,
      details: { expected_version: handshake.version, received_version: message.state_version },
    });
  }
  if (message.expected_status !== undefined && message.expected_status !== handshake.status) {
    throw new ApplicationError({
      code: "INVALID_STATE",
      message: `Message expected ${message.expected_status}, but handshake is ${handshake.status}.`,
      messageId: message.message_id,
      handshakeId: message.handshake_id,
      details: { expected_status: handshake.status, received_status: message.expected_status },
    });
  }
}

function mapOwnerDecision(message: OwnerDecisionMessage): HandshakeCommand {
  switch (message.payload.decision) {
    case "continue":
      return {
        type: "SUBMIT_CONSENT",
        participantId: message.sender_endpoint_id,
        decision: "CONTINUE",
        consentVersion: message.payload.consent_version,
      };
    case "decline":
      return {
        type: "SUBMIT_CONSENT",
        participantId: message.sender_endpoint_id,
        decision: "DECLINE",
        consentVersion: message.payload.consent_version,
      };
    case "clarify":
      throw new ApplicationError({
        code: "UNSUPPORTED_MESSAGE_TYPE",
        message: "The feasibility flow has no clarification round; clarify is rejected.",
        messageId: message.message_id,
        handshakeId: message.handshake_id,
      });
    case "terminate":
      return { type: "TERMINATE", to: "CANCELLED", code: "USER_CANCELLED" };
  }
}

function mapTermination(message: TerminateMessage): HandshakeCommand {
  const { final_status: status, stop_code: code } = message.payload;
  if (status === "CANCELLED") {
    throw new ApplicationError({
      code: "UNSUPPORTED_MESSAGE_TYPE",
      message: "HSP 0.2 TERMINATE cannot prove the USER_CANCELLED reason required by the domain.",
      messageId: message.message_id,
      handshakeId: message.handshake_id,
    });
  }
  if (status === "EXPIRED" && code === "TIMEOUT") {
    return { type: "TERMINATE", to: "EXPIRED", code };
  }
  if (status === "POLICY_BLOCKED" && code === "POLICY_BLOCKED") {
    return { type: "TERMINATE", to: "POLICY_BLOCKED", code };
  }
  if (status === "FAILED" && (code === "BUDGET_EXHAUSTED" || code === "LOW_CONFIDENCE")) {
    return { type: "TERMINATE", to: "FAILED", code };
  }
  throw new ApplicationError({
    code: "UNSUPPORTED_MESSAGE_TYPE",
    message: `TERMINATE ${status}/${code} cannot be expressed by the domain termination command.`,
    messageId: message.message_id,
    handshakeId: message.handshake_id,
  });
}

function assertCommitApplied(result: CommitMessageResult, message: HspMessage): void {
  if (result === "REPLAY_DETECTED") {
    throw new ApplicationError({
      code: "REPLAY_DETECTED",
      message: "The message id, sender-scoped nonce, or sender sequence was already committed.",
      messageId: message.message_id,
      handshakeId: message.handshake_id,
    });
  }
  if (result === "CONCURRENT_MODIFICATION") {
    throw new ApplicationError({
      code: "CONCURRENT_MODIFICATION",
      message: "The handshake changed before this message could be committed.",
      retryable: true,
      messageId: message.message_id,
      handshakeId: message.handshake_id,
    });
  }
}
