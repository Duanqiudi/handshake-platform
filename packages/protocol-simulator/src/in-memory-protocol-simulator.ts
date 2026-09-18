import {
  ApplicationError,
  type ApplicationErrorCode,
  canonicalSha256,
  mapHspMessageToCommand,
} from "@handshake/application";
import {
  applyHandshakeCommand,
  createHandshake,
  type Handshake,
  type HandshakeCommand,
} from "@handshake/domain";
import {
  assertHspMessage,
  type HspErrorCode,
  type HspMessage,
  HspProtocolError,
} from "@handshake/hsp-contracts";
import {
  type SimulationBoundaryCode,
  SimulationBoundaryError,
  validateMessageScopeForHandshake,
  validateMessageStateForHandshake,
} from "./boundary-validation.js";
import type { SyntheticEndpoint } from "./synthetic-endpoint.js";

export const PROTOCOL_SIMULATOR_REJECTION_CODES = [
  "UNSUPPORTED_MESSAGE_TYPE",
  "DOMAIN_COMMAND_REJECTED",
] as const;

export type ProtocolSimulatorRejectionCode =
  | ApplicationErrorCode
  | HspErrorCode
  | SimulationBoundaryCode
  | (typeof PROTOCOL_SIMULATOR_REJECTION_CODES)[number];

export interface ProtocolSimulatorOptions {
  readonly handshakeId: string;
  readonly communityId: string;
  readonly scene: string;
  readonly purpose: string;
  readonly endpoints: readonly [SyntheticEndpoint, SyntheticEndpoint];
  readonly now?: () => Date;
}

export interface ProtocolSimulatorRejection {
  readonly code: ProtocolSimulatorRejectionCode;
  readonly message: string;
}

export type ProtocolSimulatorReceiveResult =
  | {
      readonly accepted: true;
      readonly message: HspMessage;
      readonly command: HandshakeCommand;
      readonly handshake: Handshake;
    }
  | {
      readonly accepted: false;
      readonly rejection: ProtocolSimulatorRejection;
      readonly handshake: Handshake;
    };

const BOOTSTRAP_STATUSES = [
  "READY",
  "DISCOVERING",
  "CANDIDATE_FOUND",
  "OWNER_AUTHORIZED",
  "SCREENING",
] as const;

/**
 * A deterministic composition-layer harness. It validates wire DTOs before mapping them into
 * pure domain commands and deliberately contains no transport, persistence, or model execution.
 */
export class InMemoryProtocolSimulator {
  readonly #now: () => Date;
  readonly #participantIds: readonly [string, string];
  readonly #processedMessages = new Map<string, string>();
  readonly #statusHistory: Handshake["status"][] = ["DRAFT"];
  #handshake: Handshake;

  public constructor(options: ProtocolSimulatorOptions) {
    const [first, second] = options.endpoints;
    if (first.endpointId === second.endpointId) {
      throw new Error("Synthetic endpoint ids must be distinct.");
    }
    if (first.communityId !== options.communityId || second.communityId !== options.communityId) {
      throw new Error("Synthetic endpoints must belong to the simulator community.");
    }

    this.#now = options.now ?? (() => new Date());
    this.#participantIds = [first.endpointId, second.endpointId];
    this.#handshake = createHandshake({
      id: options.handshakeId,
      communityId: options.communityId,
      scene: options.scene,
      purpose: options.purpose,
      participantIds: this.#participantIds,
      budgetLimits: {
        maxRounds: 6,
        maxQuestionsPerRound: 3,
        maxTokens: 6_000,
        maxCostMicros: 1_000_000,
      },
    });
  }

  public get handshake(): Handshake {
    return this.#handshake;
  }

  public get statusHistory(): readonly Handshake["status"][] {
    return this.#statusHistory;
  }

  public bootstrapToScreening(): void {
    if (this.#handshake.status !== "DRAFT") {
      throw new Error("The simulator can only bootstrap a DRAFT handshake.");
    }
    for (const status of BOOTSTRAP_STATUSES) {
      this.#applyOrThrow(
        { type: "ADVANCE", to: status },
        `bootstrap:${this.#handshake.id}:${this.#handshake.version}:${status}`,
      );
    }
  }

  public receive(input: unknown): ProtocolSimulatorReceiveResult {
    let message: HspMessage;
    try {
      message = assertHspMessage(input, { now: this.#now() });
      validateMessageScopeForHandshake(this.#handshake, message);
      const priorEnvelopeDigest = this.#processedMessages.get(message.message_id);
      if (priorEnvelopeDigest !== undefined) {
        const replayKind =
          priorEnvelopeDigest === canonicalSha256(message)
            ? "has already been processed"
            : "was reused with different content";
        return this.#rejected("REPLAY_DETECTED", `Message ${message.message_id} ${replayKind}.`);
      }
      validateMessageStateForHandshake(this.#handshake, message);
    } catch (error) {
      if (error instanceof SimulationBoundaryError) {
        return this.#rejected(error.code, error.message);
      }
      if (error instanceof HspProtocolError) {
        return this.#rejected(error.code, error.message);
      }
      throw error;
    }

    const command = this.#mapMessage(message);
    if ("rejection" in command) {
      return this.#rejected(command.rejection.code, command.rejection.message);
    }

    const beforeStatus = this.#handshake.status;
    const result = applyHandshakeCommand(this.#handshake, {
      idempotencyKey: message.idempotency_key,
      commandDigest: canonicalSha256(command.value),
      expectedVersion: this.#handshake.version,
      command: command.value,
    });
    if (result.outcome === "DUPLICATE") {
      return this.#rejected(
        "REPLAY_DETECTED",
        `Idempotency key ${message.idempotency_key} has already been processed.`,
      );
    }
    if (result.outcome === "REJECTED") {
      return this.#rejected(
        "DOMAIN_COMMAND_REJECTED",
        `${result.rejection.code}: ${result.rejection.message}`,
      );
    }

    this.#handshake = result.handshake;
    this.#processedMessages.set(message.message_id, canonicalSha256(message));
    if (this.#handshake.status !== beforeStatus) {
      this.#statusHistory.push(this.#handshake.status);
    }
    return {
      accepted: true,
      message,
      command: command.value,
      handshake: this.#handshake,
    };
  }

  #mapMessage(
    message: HspMessage,
  ): { readonly value: HandshakeCommand } | { readonly rejection: ProtocolSimulatorRejection } {
    try {
      return { value: mapHspMessageToCommand(message) };
    } catch (error) {
      if (error instanceof ApplicationError) {
        return {
          rejection: {
            code: error.code,
            message: error.message,
          },
        };
      }
      throw error;
    }
  }

  #applyOrThrow(command: HandshakeCommand, idempotencyKey: string): void {
    const beforeStatus = this.#handshake.status;
    const result = applyHandshakeCommand(this.#handshake, {
      idempotencyKey,
      commandDigest: canonicalSha256(command),
      expectedVersion: this.#handshake.version,
      command,
    });
    if (result.outcome !== "APPLIED") {
      const detail = result.outcome === "REJECTED" ? result.rejection.message : result.outcome;
      throw new Error(`Simulator bootstrap failed: ${detail}`);
    }
    this.#handshake = result.handshake;
    if (this.#handshake.status !== beforeStatus) {
      this.#statusHistory.push(this.#handshake.status);
    }
  }

  #rejected(code: ProtocolSimulatorRejectionCode, message: string): ProtocolSimulatorReceiveResult {
    return {
      accepted: false,
      rejection: { code, message },
      handshake: this.#handshake,
    };
  }
}
