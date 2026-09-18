import {
  type HandshakeStatus,
  HSP_PROTOCOL_VERSION,
  type HspMessageOf,
  type HspMessageType,
  type HspPayloadByType,
} from "@handshake/hsp-contracts";

const SYNTHETIC_SIGNATURE_VALUE = "A".repeat(43);

export interface SyntheticEndpointOptions {
  readonly endpointId: string;
  readonly communityId: string;
  readonly now?: () => Date;
}

export interface SyntheticMessageInput<TType extends HspMessageType> {
  readonly type: TType;
  readonly payload: HspPayloadByType[TType];
  readonly handshakeId: string;
  readonly recipientEndpointId: string;
  readonly stateVersion: number;
  readonly expectedStatus?: HandshakeStatus;
  readonly communityId?: string;
  readonly messageId?: string;
  readonly ttlMs?: number;
}

/**
 * A schema-shaped Endpoint used only by the in-memory simulator.
 *
 * Its signature is deliberately a placeholder. This package proves contract and orchestration
 * boundaries; cryptographic identity belongs to a later transport/security slice.
 */
export class SyntheticEndpoint {
  public readonly endpointId: string;
  public readonly communityId: string;

  readonly #now: () => Date;
  #sequence = 0;

  public constructor(options: SyntheticEndpointOptions) {
    this.endpointId = options.endpointId;
    this.communityId = options.communityId;
    this.#now = options.now ?? (() => new Date());
  }

  public createMessage<TType extends HspMessageType>(
    input: SyntheticMessageInput<TType>,
  ): HspMessageOf<TType> {
    this.#sequence += 1;
    const issuedAt = this.#now();
    const expiresAt = new Date(issuedAt.getTime() + (input.ttlMs ?? 60_000));
    const sequenceSuffix = this.#sequence.toString().padStart(8, "0");
    const messageId = input.messageId ?? `msg_${this.endpointId}_${sequenceSuffix}`;

    return {
      protocol: "hsp",
      protocol_version: HSP_PROTOCOL_VERSION,
      message_id: messageId,
      handshake_id: input.handshakeId,
      community_id: input.communityId ?? this.communityId,
      type: input.type,
      sender_endpoint_id: this.endpointId,
      recipient_endpoint_id: input.recipientEndpointId,
      sequence: this.#sequence,
      state_version: input.stateVersion,
      idempotency_key: `idem:${this.endpointId}:${sequenceSuffix}`,
      nonce: `synthetic_${this.endpointId}_${sequenceSuffix}`,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      ...(input.expectedStatus === undefined ? {} : { expected_status: input.expectedStatus }),
      payload: input.payload,
      signature: {
        algorithm: "Ed25519",
        key_id: `${this.endpointId}:synthetic`,
        value: SYNTHETIC_SIGNATURE_VALUE,
      },
    };
  }
}

export function createSyntheticEndpoint(options: SyntheticEndpointOptions): SyntheticEndpoint {
  return new SyntheticEndpoint(options);
}
