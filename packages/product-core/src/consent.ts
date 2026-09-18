import { createHash } from "node:crypto";
import type {
  Consent,
  HandshakeDisclosureContent,
  ProductHandshake,
  RevealedContact,
} from "./types.js";

const CONSENT_PREFIX = "consent_v1_";

/** Hashes the exact disclosure snapshot with canonical object-key ordering. */
export function createConsentVersion(content: HandshakeDisclosureContent | unknown): string {
  const canonical = canonicalJson(content);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `${CONSENT_PREFIX}${digest}`;
}

/**
 * A contact is revealable only if both distinct participants accepted the exact current snapshot.
 */
export function canRevealContacts(
  handshake: Pick<
    ProductHandshake,
    "participantOwnerIds" | "decisions" | "disclosureContent" | "status"
  >,
): boolean {
  if (
    handshake.status !== "WAITING_DUAL_CONSENT" &&
    handshake.status !== "REVEALED" &&
    handshake.status !== "INTRODUCED" &&
    handshake.status !== "FEEDBACK_COMPLETE" &&
    handshake.status !== "DISPUTED"
  ) {
    return false;
  }

  const expectedVersion = createConsentVersion(handshake.disclosureContent);
  const current = latestDecisionByOwner(handshake.decisions);
  return handshake.participantOwnerIds.every((ownerId) => {
    const decision = current.get(ownerId);
    return decision?.decision === "continue" && decision.consentVersion === expectedVersion;
  });
}

export function revealContacts(
  handshake: ProductHandshake,
  contacts: readonly [RevealedContact, RevealedContact],
  revealedAt: string,
): ProductHandshake {
  if (!canRevealContacts(handshake)) {
    throw new Error("Contacts cannot be revealed before valid dual consent.");
  }

  const contactOwners = new Set(contacts.map((contact) => contact.ownerId));
  if (
    contactOwners.size !== 2 ||
    !handshake.participantOwnerIds.every((ownerId) => contactOwners.has(ownerId))
  ) {
    throw new Error("Contact reveal must contain exactly both handshake participants.");
  }
  if (!isIsoDateTime(revealedAt)) {
    throw new Error("Contact reveal time must be an ISO date-time.");
  }

  return {
    ...handshake,
    status: "REVEALED",
    contactReveal: {
      revealedAt,
      contacts: [{ ...contacts[0] }, { ...contacts[1] }],
    },
    updatedAt: revealedAt,
  };
}

function latestDecisionByOwner(decisions: readonly Consent[]): Map<string, Consent> {
  const ordered = [...decisions].sort((left, right) =>
    left.decidedAt.localeCompare(right.decidedAt),
  );
  return new Map(ordered.map((decision) => [decision.ownerId, decision]));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Consent content cannot contain non-finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .map((item) => ({ item, sortKey: JSON.stringify(item) }))
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .map(({ item }) => item);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  throw new Error(`Consent content contains unsupported ${typeof value}.`);
}

function isIsoDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
