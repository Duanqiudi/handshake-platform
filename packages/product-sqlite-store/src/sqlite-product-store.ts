import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  LoadProductCommunityInput,
  ProductCommunitySnapshot,
  ProductStore,
  SaveProductCommunityInput,
  SaveProductCommunityResult,
} from "@handshake/product-application";
import {
  validateAiConnection,
  validateMemoryCapsule,
  validateOwner,
  validatePortfolioProject,
  validatePrivacyReceipt,
  validateProductHandshake,
  validateProjectIntent,
} from "@handshake/product-core";

export interface SqliteProductStoreOptions {
  readonly path: string;
  readonly busyTimeoutMs?: number;
}

export class ProductStoreCorruptionError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProductStoreCorruptionError";
  }
}

export class SqliteProductStore implements ProductStore {
  readonly #database: DatabaseSync;
  #closed = false;

  public constructor(options: SqliteProductStoreOptions) {
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

  public async load(input: LoadProductCommunityInput): Promise<ProductCommunitySnapshot | null> {
    this.#assertOpen();
    const row = this.#database
      .prepare(`SELECT snapshot_json FROM product_community_snapshots WHERE community_id = ?`)
      .get(input.communityId);
    if (row === undefined) return null;
    if (typeof row.snapshot_json !== "string") {
      throw new ProductStoreCorruptionError("Product snapshot is not stored as JSON text.");
    }
    try {
      const snapshot = JSON.parse(row.snapshot_json) as ProductCommunitySnapshot;
      assertValidSnapshot(snapshot, input.communityId);
      return snapshot;
    } catch (error) {
      if (error instanceof ProductStoreCorruptionError) throw error;
      throw new ProductStoreCorruptionError("Stored product snapshot is invalid.", {
        cause: error,
      });
    }
  }

  public async save(input: SaveProductCommunityInput): Promise<SaveProductCommunityResult> {
    this.#assertOpen();
    assertValidSnapshot(input.snapshot, input.communityId);
    if (input.snapshot.version !== input.expectedVersion + 1) {
      throw new TypeError("Product snapshot version must advance exactly once.");
    }
    const updatedAt = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#database
        .prepare(`SELECT version FROM product_community_snapshots WHERE community_id = ?`)
        .get(input.communityId);
      if (current === undefined) {
        if (input.expectedVersion !== 0) {
          this.#database.exec("ROLLBACK");
          return "CONCURRENT_MODIFICATION";
        }
        this.#database
          .prepare(
            `INSERT INTO product_community_snapshots
              (community_id, version, snapshot_json, updated_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(
            input.communityId,
            input.snapshot.version,
            JSON.stringify(input.snapshot),
            updatedAt,
          );
        this.#database.exec("COMMIT");
        return "APPLIED";
      }
      if (Number(current.version) !== input.expectedVersion) {
        this.#database.exec("ROLLBACK");
        return "CONCURRENT_MODIFICATION";
      }
      const result = this.#database
        .prepare(
          `UPDATE product_community_snapshots
           SET version = ?, snapshot_json = ?, updated_at = ?
           WHERE community_id = ? AND version = ?`,
        )
        .run(
          input.snapshot.version,
          JSON.stringify(input.snapshot),
          updatedAt,
          input.communityId,
          input.expectedVersion,
        );
      if (Number(result.changes) !== 1) {
        this.#database.exec("ROLLBACK");
        return "CONCURRENT_MODIFICATION";
      }
      this.#database.exec("COMMIT");
      return "APPLIED";
    } catch (error) {
      this.#rollback();
      throw error;
    }
  }

  public async reset(snapshot: ProductCommunitySnapshot): Promise<void> {
    this.#assertOpen();
    assertValidSnapshot(snapshot, snapshot.communityId);
    this.#database
      .prepare(
        `INSERT INTO product_community_snapshots
          (community_id, version, snapshot_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(community_id) DO UPDATE SET
          version = excluded.version,
          snapshot_json = excluded.snapshot_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        snapshot.communityId,
        snapshot.version,
        JSON.stringify(snapshot),
        new Date().toISOString(),
      );
  }

  public async healthCheck(): Promise<void> {
    this.#assertOpen();
    const row = this.#database.prepare("SELECT 1 AS healthy").get();
    if (row?.healthy !== 1) throw new Error("SQLite product store health check failed.");
  }

  public close(): void {
    if (!this.#closed) {
      this.#database.close();
      this.#closed = true;
    }
  }

  #migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS product_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const applied = this.#database
      .prepare("SELECT 1 FROM product_schema_migrations WHERE version = 1")
      .get();
    if (applied !== undefined) return;
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.exec(`
        CREATE TABLE IF NOT EXISTS product_community_snapshots (
          community_id TEXT PRIMARY KEY,
          version INTEGER NOT NULL CHECK (version >= 0),
          snapshot_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
      this.#database
        .prepare("INSERT INTO product_schema_migrations (version, applied_at) VALUES (1, ?)")
        .run(new Date().toISOString());
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#rollback();
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("SQLite product store is closed.");
  }

  #rollback(): void {
    try {
      this.#database.exec("ROLLBACK");
    } catch {
      // Preserve the original SQLite error.
    }
  }
}

function assertValidSnapshot(snapshot: ProductCommunitySnapshot, communityId: string): void {
  if (
    snapshot.schemaVersion !== "product-community-0.1" ||
    snapshot.communityId !== communityId ||
    !Number.isSafeInteger(snapshot.version) ||
    snapshot.version < 0
  ) {
    throw new ProductStoreCorruptionError("Product snapshot header is invalid.");
  }
  const validations = [
    ...snapshot.owners.map(validateOwner),
    ...snapshot.connections.map(validateAiConnection),
    ...snapshot.capsules.map(validateMemoryCapsule),
    ...snapshot.intents.map(validateProjectIntent),
    ...snapshot.handshakes.map((record) => validateProductHandshake(record.product)),
    ...snapshot.receipts.map(validatePrivacyReceipt),
    ...snapshot.projects.map(validatePortfolioProject),
  ];
  if (validations.some((validation) => !validation.success)) {
    throw new ProductStoreCorruptionError("Product snapshot contains an invalid entity.");
  }
  const ownerIds = new Set(snapshot.owners.map((owner) => owner.id));
  if (
    snapshot.ownerTokens.some(
      (token) =>
        !ownerIds.has(token.ownerId) ||
        token.tokenDigest.length < 32 ||
        token.issuedAt.trim().length === 0,
    )
  ) {
    throw new ProductStoreCorruptionError("Product snapshot contains an invalid owner token.");
  }
}
