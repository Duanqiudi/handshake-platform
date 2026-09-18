import type { Handshake, HandshakeStatus } from "@handshake/domain";

export interface CreateHandshakeStoreInput {
  readonly handshake: Handshake;
}

export type CreateHandshakeStoreResult = "CREATED" | "ALREADY_EXISTS";

export interface FindHandshakeInput {
  readonly communityId: string;
  readonly handshakeId: string;
}

export interface MessageCommitMetadata {
  readonly messageId: string;
  readonly senderEndpointId: string;
  readonly sequence: number;
  readonly nonce: string;
  readonly envelopeDigest: string;
}

export interface ReplayCheckInput {
  readonly communityId: string;
  readonly handshakeId: string;
  readonly messageId: string;
  readonly senderEndpointId: string;
  readonly sequence: number;
  readonly nonce: string;
}

export interface CommitMessageInput {
  /** Repeated explicitly so an adapter never has to infer its tenant predicate. */
  readonly communityId: string;
  readonly handshakeId: string;
  readonly expectedVersion: number;
  readonly nextHandshake: Handshake;
  readonly message: MessageCommitMetadata;
  readonly fromStatus: HandshakeStatus;
  readonly toStatus: HandshakeStatus;
  readonly occurredAt: string;
}

export type CommitMessageResult = "APPLIED" | "REPLAY_DETECTED" | "CONCURRENT_MODIFICATION";

/**
 * Persistence port owned by the application layer.
 *
 * `find` is tenant-scoped. `commitMessage` must atomically reserve message id, sender-scoped nonce,
 * and monotonically increasing `(handshake, sender, sequence)`, compare `expectedVersion`, write
 * the aggregate, and append message/transition metadata.
 */
export interface HandshakeStore {
  create(input: CreateHandshakeStoreInput): Promise<CreateHandshakeStoreResult>;
  find(input: FindHandshakeInput): Promise<Handshake | null>;
  /** Fast durable lookup for message id, sender-scoped nonce, or old sender sequence. */
  hasReplay(input: ReplayCheckInput): Promise<boolean>;
  commitMessage(input: CommitMessageInput): Promise<CommitMessageResult>;
}
