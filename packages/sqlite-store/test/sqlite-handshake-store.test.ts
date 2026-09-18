import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CommitMessageInput } from "@handshake/application";
import {
  applyHandshakeCommand,
  createHandshake,
  type Handshake,
  type HandshakeStatus,
} from "@handshake/domain";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteHandshakeStore } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function draftHandshake(): Handshake {
  return createHandshake({
    id: "hs_sqlite",
    communityId: "community_alpha",
    scene: "professional_collaboration",
    purpose: "find_product_design_partner",
    participantIds: ["endpoint_alpha", "endpoint_beta"],
    budgetLimits: {
      maxRounds: 6,
      maxQuestionsPerRound: 3,
      maxTokens: 6_000,
      maxCostMicros: 1_000_000,
    },
  });
}

function advanceTo(handshake: Handshake, to: HandshakeStatus, idempotencyKey: string): Handshake {
  const result = applyHandshakeCommand(handshake, {
    idempotencyKey,
    commandDigest: `sha256:${idempotencyKey}`,
    expectedVersion: handshake.version,
    command: { type: "ADVANCE", to },
  });
  if (result.outcome !== "APPLIED") {
    throw new Error("Test fixture could not advance the Handshake.");
  }
  return result.handshake;
}

function advanceToReady(handshake: Handshake): Handshake {
  return advanceTo(handshake, "READY", "test:advance:ready");
}

function commitInput(
  previous: Handshake,
  next: Handshake,
  overrides: Partial<CommitMessageInput["message"]> = {},
): CommitMessageInput {
  return {
    communityId: previous.communityId,
    handshakeId: previous.id,
    expectedVersion: previous.version,
    nextHandshake: next,
    message: {
      messageId: overrides.messageId ?? "msg_sqlite_0001",
      senderEndpointId: overrides.senderEndpointId ?? "endpoint_alpha",
      sequence: overrides.sequence ?? 1,
      nonce: overrides.nonce ?? "nonce_sqlite_0001",
      envelopeDigest: overrides.envelopeDigest ?? `sha256:${"a".repeat(64)}`,
    },
    fromStatus: previous.status,
    toStatus: next.status,
    occurredAt: "2026-09-14T10:00:00.000Z",
  };
}

function databasePath(): { readonly directory: string; readonly path: string } {
  const directory = mkdtempSync(join(tmpdir(), "handshake-sqlite-"));
  temporaryDirectories.push(directory);
  return { directory, path: join(directory, "gateway.sqlite") };
}

function databaseCounts(path: string): {
  readonly receivedMessages: number;
  readonly transitions: number;
} {
  const database = new DatabaseSync(path);
  try {
    const receivedMessages = Number(
      database.prepare("SELECT COUNT(*) AS count FROM received_messages").get()?.count ?? -1,
    );
    const transitions = Number(
      database.prepare("SELECT COUNT(*) AS count FROM handshake_transitions").get()?.count ?? -1,
    );
    return { receivedMessages, transitions };
  } finally {
    database.close();
  }
}

describe("SqliteHandshakeStore", () => {
  it("rejects an invalid aggregate before it can enter storage", async () => {
    const store = new SqliteHandshakeStore({ path: ":memory:" });
    const invalid: Handshake = {
      ...draftHandshake(),
      proposalParticipantIds: ["endpoint_outsider"],
    };

    await expect(store.create({ handshake: invalid })).rejects.toThrow(
      "Cannot persist an invalid Handshake aggregate.",
    );
    await expect(store.healthCheck()).resolves.toBeUndefined();
    store.close();
  });

  it("persists and reloads a tenant-scoped aggregate after reopening the database", async () => {
    const location = databasePath();
    const initial = draftHandshake();
    const first = new SqliteHandshakeStore({ path: location.path });
    expect(await first.create({ handshake: initial })).toBe("CREATED");
    first.close();

    const reopened = new SqliteHandshakeStore({ path: location.path });
    await expect(
      reopened.find({ communityId: initial.communityId, handshakeId: initial.id }),
    ).resolves.toEqual(initial);
    await expect(
      reopened.find({ communityId: "community_other", handshakeId: initial.id }),
    ).resolves.toBeNull();
    reopened.close();
  });

  it("atomically persists a message and optimistic aggregate update", async () => {
    const location = databasePath();
    const store = new SqliteHandshakeStore({ path: location.path });
    const previous = draftHandshake();
    const next = advanceToReady(previous);
    expect(await store.create({ handshake: previous })).toBe("CREATED");

    expect(await store.commitMessage(commitInput(previous, next))).toBe("APPLIED");
    await expect(
      store.find({ communityId: previous.communityId, handshakeId: previous.id }),
    ).resolves.toEqual(next);
    store.close();
    expect(databaseCounts(location.path)).toEqual({ receivedMessages: 1, transitions: 2 });
  });

  it("rejects duplicate message ids and nonces without changing aggregate state", async () => {
    const location = databasePath();
    const store = new SqliteHandshakeStore({ path: location.path });
    const previous = draftHandshake();
    const next = advanceToReady(previous);
    expect(await store.create({ handshake: previous })).toBe("CREATED");
    expect(await store.commitMessage(commitInput(previous, next))).toBe("APPLIED");

    await expect(
      store.hasReplay({
        communityId: previous.communityId,
        handshakeId: previous.id,
        messageId: "msg_sqlite_0001",
        senderEndpointId: "endpoint_alpha",
        sequence: 2,
        nonce: "new_nonce_0000001",
      }),
    ).resolves.toBe(true);
    await expect(
      store.hasReplay({
        communityId: previous.communityId,
        handshakeId: previous.id,
        messageId: "msg_sqlite_new",
        senderEndpointId: "endpoint_alpha",
        sequence: 2,
        nonce: "nonce_sqlite_0001",
      }),
    ).resolves.toBe(true);

    expect(await store.commitMessage(commitInput(previous, next))).toBe("REPLAY_DETECTED");
    expect(
      await store.commitMessage(commitInput(previous, next, { messageId: "msg_sqlite_0002" })),
    ).toBe("REPLAY_DETECTED");
    await expect(
      store.find({ communityId: previous.communityId, handshakeId: previous.id }),
    ).resolves.toEqual(next);
    store.close();
    expect(databaseCounts(location.path)).toEqual({ receivedMessages: 1, transitions: 2 });
  });

  it("durably rejects an old sender sequence with otherwise fresh replay keys", async () => {
    const location = databasePath();
    const previous = draftHandshake();
    const ready = advanceToReady(previous);
    const first = new SqliteHandshakeStore({ path: location.path });
    expect(await first.create({ handshake: previous })).toBe("CREATED");
    expect(
      await first.commitMessage(
        commitInput(previous, ready, {
          messageId: "msg_sequence_2",
          nonce: "nonce_sequence_2",
          sequence: 2,
        }),
      ),
    ).toBe("APPLIED");
    first.close();

    const reopened = new SqliteHandshakeStore({ path: location.path });
    await expect(
      reopened.hasReplay({
        communityId: previous.communityId,
        handshakeId: previous.id,
        messageId: "msg_sequence_fresh",
        senderEndpointId: "endpoint_alpha",
        sequence: 1,
        nonce: "nonce_sequence_fresh",
      }),
    ).resolves.toBe(true);

    const discovering = advanceTo(ready, "DISCOVERING", "test:advance:discovering");
    expect(
      await reopened.commitMessage(
        commitInput(ready, discovering, {
          messageId: "msg_sequence_old",
          nonce: "nonce_sequence_old",
          sequence: 1,
        }),
      ),
    ).toBe("REPLAY_DETECTED");
    await expect(
      reopened.find({ communityId: previous.communityId, handshakeId: previous.id }),
    ).resolves.toEqual(ready);
    reopened.close();
    expect(databaseCounts(location.path)).toEqual({ receivedMessages: 1, transitions: 2 });
  });

  it("rolls back the replay key when optimistic concurrency fails", async () => {
    const location = databasePath();
    const store = new SqliteHandshakeStore({ path: location.path });
    const previous = draftHandshake();
    const next = advanceToReady(previous);
    expect(await store.create({ handshake: previous })).toBe("CREATED");
    const wrongExpectedVersion: CommitMessageInput = {
      ...commitInput(previous, next),
      expectedVersion: 1,
      nextHandshake: { ...next, version: 2 },
    };

    expect(await store.commitMessage(wrongExpectedVersion)).toBe("CONCURRENT_MODIFICATION");
    store.close();
    expect(databaseCounts(location.path)).toEqual({ receivedMessages: 0, transitions: 1 });

    const reopened = new SqliteHandshakeStore({ path: location.path });
    expect(await reopened.commitMessage(commitInput(previous, next))).toBe("APPLIED");
    reopened.close();
    expect(databaseCounts(location.path)).toEqual({ receivedMessages: 1, transitions: 2 });
  });
});
