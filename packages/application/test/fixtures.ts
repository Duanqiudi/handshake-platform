import type { HspMessageOf, HspMessageType, HspPayloadByType } from "@handshake/hsp-contracts";

export const NOW = new Date("2026-09-14T10:00:00.000Z");

export const proposalPayload: HspPayloadByType["PROPOSAL"] = {
  recommendation: "continue",
  evidence_claim_ids: [],
  conflict_ids: [],
  unknown_predicates: [],
  summary: "Both endpoints may continue to owner review.",
  stop_code: "SUCCESS_PROPOSAL",
};

export function ownerDecisionPayload(
  decision: HspPayloadByType["OWNER_DECISION"]["decision"],
  consentVersion = "consent-0.2",
): HspPayloadByType["OWNER_DECISION"] {
  return {
    decision_id: `dec_${decision}`,
    decision,
    consent_version: consentVersion,
    ...(decision === "clarify" ? { clarification: "Please clarify availability." } : {}),
    decided_at: "2026-09-14T09:30:00.000Z",
    owner_signature: "owner_signature_abcdefghijklmnop",
  };
}

export interface MessageFixtureInput<TType extends HspMessageType> {
  readonly id: string;
  readonly type: TType;
  readonly payload: HspPayloadByType[TType];
  readonly sender?: string;
  readonly recipient?: string;
  readonly communityId?: string;
  readonly handshakeId?: string;
  readonly stateVersion: number;
  readonly expectedStatus?: HspMessageOf<TType>["expected_status"];
  readonly protocolVersion?: string;
  readonly expiresAt?: string;
  readonly nonce?: string;
  readonly sequence?: number;
}

export function makeMessage<TType extends HspMessageType>(
  input: MessageFixtureInput<TType>,
): HspMessageOf<TType> {
  return {
    protocol: "hsp",
    protocol_version: input.protocolVersion ?? "0.2.0",
    message_id: `msg_${input.id}`,
    handshake_id: input.handshakeId ?? "hs_feasibility",
    community_id: input.communityId ?? "community_alpha",
    type: input.type,
    sender_endpoint_id: input.sender ?? "agent_alpha",
    recipient_endpoint_id: input.recipient ?? "agent_beta",
    sequence: input.sequence ?? 1,
    state_version: input.stateVersion,
    idempotency_key: `idem.${input.id}.0001`,
    nonce: input.nonce ?? `nonce_${input.id}_abcdefghijklmnop`,
    issued_at: "2026-09-14T09:00:00.000Z",
    expires_at: input.expiresAt ?? "2026-09-14T11:00:00.000Z",
    ...(input.expectedStatus === undefined ? {} : { expected_status: input.expectedStatus }),
    payload: input.payload,
    signature: {
      algorithm: "Ed25519",
      key_id: "key:agent_alpha:1",
      value: "a".repeat(64),
    },
  };
}

export const createInput = {
  id: "hs_feasibility",
  communityId: "community_alpha",
  scene: "professional_collaboration",
  purpose: "find_partner",
  participantIds: ["agent_alpha", "agent_beta"],
  budgetLimits: {
    maxRounds: 3,
    maxQuestionsPerRound: 3,
    maxTokens: 4_000,
    maxCostMicros: 500_000,
  },
} as const;
