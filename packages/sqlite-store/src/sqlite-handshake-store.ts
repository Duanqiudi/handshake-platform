import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CommitMessageInput,
  CommitMessageResult,
  CreateHandshakeStoreInput,
  CreateHandshakeStoreResult,
  FindHandshakeInput,
  HandshakeStore,
  ReplayCheckInput,
} from "@handshake/application";
import { type Handshake, validateHandshake } from "@handshake/domain";
import { SQLITE_MIGRATIONS } from "./migrations.js";

export interface SqliteHandshakeStoreOptions {
  readonly path: string;
  readonly busyTimeoutMs?: number;
}

export class SqliteStoreCorruptionError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SqliteStoreCorruptionError";
  }
}

export class SqliteHandshakeStore implements HandshakeStore {
  readonly #database: DatabaseSync;
  #closed = false;

  public constructor(options: SqliteHandshakeStoreOptions) {
    if (options.path !== ":memory:") {
      mkdirSync(dirname(resolve(options.path)), { recursive: true });
    }
    this.#database = new DatabaseSync(options.path, {
      timeout: options.busyTimeoutMs ?? 5_000,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      allowExtension: false,
    });
    this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.#migrate();
  }

  public async create(input: CreateHandshakeStoreInput): Promise<CreateHandshakeStoreResult> {
    this.#assertOpen();
    const violations = validateHandshake(input.handshake);
    if (violations.length > 0) {
      throw new TypeError("Cannot persist an invalid Handshake aggregate.");
    }
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.#database
        .prepare(`
          INSERT OR IGNORE INTO handshake_aggregates (
            community_id, handshake_id, status, version, aggregate_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.handshake.communityId,
          input.handshake.id,
          input.handshake.status,
          input.handshake.version,
          JSON.stringify(input.handshake),
          now,
        );
      if (Number(result.changes) === 0) {
        this.#database.exec("ROLLBACK");
        return "ALREADY_EXISTS";
      }
      this.#database
        .prepare(`
          INSERT INTO handshake_transitions (
            community_id, handshake_id, from_status, to_status,
            aggregate_version, message_id, occurred_at
          ) VALUES (?, ?, NULL, ?, ?, NULL, ?)
        `)
        .run(
          input.handshake.communityId,
          input.handshake.id,
          input.handshake.status,
          input.handshake.version,
          now,
        );
      this.#database.exec("COMMIT");
      return "CREATED";
    } catch (error) {
      this.#rollbackAfterError();
      throw error;
    }
  }

  public async find(input: FindHandshakeInput): Promise<Handshake | null> {
    this.#assertOpen();
    const row = this.#database
      .prepare(`
        SELECT aggregate_json
        FROM handshake_aggregates
        WHERE community_id = ? AND handshake_id = ?
      `)
      .get(input.communityId, input.handshakeId);
    if (row === undefined) {
      return null;
    }
    const aggregateJson = row.aggregate_json;
    if (typeof aggregateJson !== "string") {
      throw new SqliteStoreCorruptionError("Stored Handshake JSON is not text.");
    }
    try {
      const handshake = JSON.parse(aggregateJson) as Handshake;
      const violations = validateHandshake(handshake);
      if (violations.length > 0) {
        throw new Error(violations.map(({ path, message }) => `${path}: ${message}`).join("; "));
      }
      return handshake;
    } catch (error) {
      throw new SqliteStoreCorruptionError("Stored Handshake aggregate is invalid.", {
        cause: error,
      });
    }
  }

  public async hasReplay(input: ReplayCheckInput): Promise<boolean> {
    this.#assertOpen();
    const row = this.#database
      .prepare(`
        SELECT 1 AS found
        FROM received_messages
        WHERE community_id = ?
          AND (
            message_id = ?
            OR (sender_endpoint_id = ? AND nonce = ?)
            OR (
              handshake_id = ?
              AND sender_endpoint_id = ?
              AND sequence >= ?
            )
          )
        LIMIT 1
      `)
      .get(
        input.communityId,
        input.messageId,
        input.senderEndpointId,
        input.nonce,
        input.handshakeId,
        input.senderEndpointId,
        input.sequence,
      );
    return row !== undefined;
  }

  public async commitMessage(input: CommitMessageInput): Promise<CommitMessageResult> {
    this.#assertOpen();
    this.#assertCommitInput(input);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const priorSequence = this.#database
        .prepare(`
          SELECT MAX(sequence) AS last_sequence
          FROM received_messages
          WHERE community_id = ? AND handshake_id = ? AND sender_endpoint_id = ?
        `)
        .get(input.communityId, input.handshakeId, input.message.senderEndpointId)?.last_sequence;
      if (
        (typeof priorSequence === "number" || typeof priorSequence === "bigint") &&
        input.message.sequence <= Number(priorSequence)
      ) {
        this.#database.exec("ROLLBACK");
        return "REPLAY_DETECTED";
      }
      const received = this.#database
        .prepare(`
          INSERT OR IGNORE INTO received_messages (
            community_id, message_id, handshake_id, sender_endpoint_id,
            sequence, nonce, envelope_digest, received_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.communityId,
          input.message.messageId,
          input.handshakeId,
          input.message.senderEndpointId,
          input.message.sequence,
          input.message.nonce,
          input.message.envelopeDigest,
          input.occurredAt,
        );
      if (Number(received.changes) === 0) {
        this.#database.exec("ROLLBACK");
        return "REPLAY_DETECTED";
      }

      const updated = this.#database
        .prepare(`
          UPDATE handshake_aggregates
          SET status = ?, version = ?, aggregate_json = ?, updated_at = ?
          WHERE community_id = ? AND handshake_id = ? AND version = ? AND status = ?
        `)
        .run(
          input.nextHandshake.status,
          input.nextHandshake.version,
          JSON.stringify(input.nextHandshake),
          input.occurredAt,
          input.communityId,
          input.handshakeId,
          input.expectedVersion,
          input.fromStatus,
        );
      if (Number(updated.changes) === 0) {
        this.#database.exec("ROLLBACK");
        return "CONCURRENT_MODIFICATION";
      }

      this.#database
        .prepare(`
          INSERT INTO handshake_transitions (
            community_id, handshake_id, from_status, to_status,
            aggregate_version, message_id, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.communityId,
          input.handshakeId,
          input.fromStatus,
          input.toStatus,
          input.nextHandshake.version,
          input.message.messageId,
          input.occurredAt,
        );
      this.#database.exec("COMMIT");
      return "APPLIED";
    } catch (error) {
      this.#rollbackAfterError();
      throw error;
    }
  }

  public close(): void {
    if (!this.#closed) {
      this.#database.close();
      this.#closed = true;
    }
  }

  public async healthCheck(): Promise<void> {
    this.#assertOpen();
    const row = this.#database.prepare("SELECT 1 AS healthy").get();
    if (row?.healthy !== 1) {
      throw new Error("SQLite health check failed.");
    }
  }

  #migrate(): void {
    const row = this.#database.prepare("PRAGMA user_version").get();
    const currentVersion = Number(row?.user_version ?? 0);
    for (const migration of SQLITE_MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue;
      }
      this.#database.exec("BEGIN IMMEDIATE");
      try {
        this.#database.exec(migration.sql);
        this.#database.exec(`PRAGMA user_version = ${migration.version}`);
        this.#database.exec("COMMIT");
      } catch (error) {
        this.#rollbackAfterError();
        throw error;
      }
    }
  }

  #assertCommitInput(input: CommitMessageInput): void {
    if (
      input.nextHandshake.id !== input.handshakeId ||
      input.nextHandshake.communityId !== input.communityId ||
      input.nextHandshake.version !== input.expectedVersion + 1 ||
      input.nextHandshake.status !== input.toStatus
    ) {
      throw new TypeError("Commit input does not match the target aggregate or next version.");
    }
    if (!Number.isSafeInteger(input.message.sequence) || input.message.sequence <= 0) {
      throw new TypeError("Message sequence must be a positive safe integer.");
    }
    const violations = validateHandshake(input.nextHandshake);
    if (violations.length > 0) {
      throw new TypeError("Cannot persist an invalid Handshake aggregate.");
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("SQLite Handshake store is closed.");
    }
  }

  #rollbackAfterError(): void {
    try {
      this.#database.exec("ROLLBACK");
    } catch {
      // Preserve the original transaction error when SQLite has already rolled back.
    }
  }
}
