import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Handshake, HandshakeCommand } from "@handshake/domain";
import { applyHandshakeCommand } from "@handshake/domain";
import { ProductError } from "./errors.js";

export interface ProductRuntime {
  readonly now: () => Date;
  readonly createId: (prefix: string) => string;
  readonly createToken: () => string;
}

export function defaultRuntime(): ProductRuntime {
  return {
    now: () => new Date(),
    createId: (prefix) => `${prefix}_${randomUUID().replaceAll("-", "")}`,
    createToken: () => `hs_${randomBytes(24).toString("base64url")}`,
  };
}

export function sha256(value: unknown): string {
  const serialized = typeof value === "string" ? value : stableJson(value);
  return createHash("sha256").update(serialized).digest("hex");
}

export function tokenDigest(token: string): string {
  return sha256(`handshake-owner-token:${token}`);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function applyProtocolCommand(
  handshake: Handshake,
  command: HandshakeCommand,
  operationId: string,
): Handshake {
  const result = applyHandshakeCommand(handshake, {
    idempotencyKey: `product:${handshake.id}:${operationId}`,
    commandDigest: sha256(command),
    expectedVersion: handshake.version,
    command,
  });
  if (result.outcome !== "APPLIED") {
    const message =
      result.outcome === "REJECTED"
        ? result.rejection.message
        : "The product command was already applied.";
    throw new ProductError("INVALID_STATE", message, 409, {
      outcome: result.outcome,
      ...(result.outcome === "REJECTED" ? { domainCode: result.rejection.code } : {}),
    });
  }
  return result.handshake;
}

export function nonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ProductError("INVALID_INPUT", `${field} must not be blank.`, 400, { field });
  }
  return normalized;
}
