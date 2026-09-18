import type { Handshake } from "@handshake/domain";
import type {
  CommitMessageInput,
  CommitMessageResult,
  CreateHandshakeStoreInput,
  CreateHandshakeStoreResult,
  FindHandshakeInput,
  HandshakeStore,
  ReplayCheckInput,
} from "../src/index.js";

function key(communityId: string, handshakeId: string): string {
  return `${communityId}\u0000${handshakeId}`;
}

/** Executable example of the atomic store contract; deliberately test-only. */
export class FakeHandshakeStore implements HandshakeStore {
  public readonly commits: CommitMessageInput[] = [];
  public nextCommitResult: CommitMessageResult | undefined;
  readonly #handshakes = new Map<string, Handshake>();
  readonly #messageIds = new Set<string>();
  readonly #senderNonces = new Set<string>();
  readonly #senderSequences = new Map<string, number>();

  public async create(input: CreateHandshakeStoreInput): Promise<CreateHandshakeStoreResult> {
    const recordKey = key(input.handshake.communityId, input.handshake.id);
    if (this.#handshakes.has(recordKey)) {
      return "ALREADY_EXISTS";
    }
    this.#handshakes.set(recordKey, structuredClone(input.handshake));
    return "CREATED";
  }

  public async find(input: FindHandshakeInput): Promise<Handshake | null> {
    const handshake = this.#handshakes.get(key(input.communityId, input.handshakeId));
    return handshake === undefined ? null : structuredClone(handshake);
  }

  public async hasReplay(input: ReplayCheckInput): Promise<boolean> {
    const sequenceKey = `${input.communityId}\u0000${input.handshakeId}\u0000${input.senderEndpointId}`;
    const lastSequence = this.#senderSequences.get(sequenceKey);
    return (
      this.#messageIds.has(`${input.communityId}\u0000${input.messageId}`) ||
      this.#senderNonces.has(
        `${input.communityId}\u0000${input.senderEndpointId}\u0000${input.nonce}`,
      ) ||
      (lastSequence !== undefined && input.sequence <= lastSequence)
    );
  }

  public async commitMessage(input: CommitMessageInput): Promise<CommitMessageResult> {
    if (this.nextCommitResult !== undefined) {
      const result = this.nextCommitResult;
      this.nextCommitResult = undefined;
      return result;
    }
    if (
      await this.hasReplay({
        communityId: input.communityId,
        handshakeId: input.handshakeId,
        messageId: input.message.messageId,
        senderEndpointId: input.message.senderEndpointId,
        sequence: input.message.sequence,
        nonce: input.message.nonce,
      })
    ) {
      return "REPLAY_DETECTED";
    }

    const recordKey = key(input.communityId, input.handshakeId);
    const current = this.#handshakes.get(recordKey);
    if (
      current === undefined ||
      current.version !== input.expectedVersion ||
      input.nextHandshake.id !== input.handshakeId ||
      input.nextHandshake.communityId !== input.communityId
    ) {
      return "CONCURRENT_MODIFICATION";
    }

    this.#messageIds.add(`${input.communityId}\u0000${input.message.messageId}`);
    this.#senderNonces.add(
      `${input.communityId}\u0000${input.message.senderEndpointId}\u0000${input.message.nonce}`,
    );
    this.#senderSequences.set(
      `${input.communityId}\u0000${input.handshakeId}\u0000${input.message.senderEndpointId}`,
      input.message.sequence,
    );
    this.#handshakes.set(recordKey, structuredClone(input.nextHandshake));
    this.commits.push(structuredClone(input));
    return "APPLIED";
  }
}
