import {
  type AgentCard,
  type ClaimEnvelope,
  HSP_MESSAGE_TYPES,
  HSP_PROTOCOL_VERSION,
  type HspMessageOf,
  type HspMessageType,
  type HspPayloadByType,
  type IntentCapsule,
} from "../src/index.js";

const signature = {
  algorithm: "Ed25519",
  key_id: "key:agent_alpha:1",
  value: "a".repeat(64),
} as const;

export const validAgentCard: AgentCard = {
  schema_version: "agent-card-0.2",
  card_id: "card_alpha",
  endpoint_id: "agent_alpha",
  community_ids: ["community_alpha"],
  owner_binding: {
    status: "verified",
    method: "phone",
    verified_at: "2026-09-14T08:00:00.000Z",
  },
  protocol_versions: [HSP_PROTOCOL_VERSION],
  capabilities: {
    message_types: HSP_MESSAGE_TYPES,
    claim_predicates: ["skill.product_design", "availability.hours_per_week"],
    features: ["owner_handoff", "evidence_request", "dual_consent", "contact_reveal"],
  },
  scenes: ["professional_collaboration"],
  public_attributes: { industry: "software", years_active: 5 },
  online_status: "online",
  model: { provider: "doubao", model: "doubao-seed" },
  memory_location: "device",
  issued_at: "2026-09-14T08:00:00.000Z",
  expires_at: "2026-10-14T08:00:00.000Z",
  signature,
};

export const validIntentCapsule: IntentCapsule = {
  schema_version: "intent-capsule-0.2",
  intent_id: "int_alpha",
  endpoint_id: "agent_alpha",
  community_id: "community_alpha",
  scene: "professional_collaboration",
  purpose: "find_product_design_partner",
  mode: "seek",
  resources: ["AI product design partner"],
  hard_constraints: [
    {
      constraint_id: "con_hours",
      predicate: "availability.hours_per_week",
      operator: "gte",
      value: 8,
    },
  ],
  soft_preferences: [],
  locations: ["Shanghai", "remote"],
  languages: ["zh-CN", "en"],
  allowed_disclosures: ["skill.product_design", "availability.hours_per_week"],
  prohibited_disclosures: ["identity.government_id"],
  status: "active",
  created_at: "2026-09-14T08:00:00.000Z",
  expires_at: "2026-10-14T08:00:00.000Z",
  signature,
};

export const validClaimEnvelope: ClaimEnvelope = {
  schema_version: "claim-envelope-0.2",
  envelope_id: "cenv_alpha",
  purpose: "find_product_design_partner",
  scene: "professional_collaboration",
  recipient_endpoint_id: "agent_beta",
  claims: [
    {
      claim_id: "clm_design",
      predicate: "skill.product_design",
      value: "AI consumer product prototyping",
      source_type: "owner_confirmed",
      source_ref: "local:claim:design",
      confidence: "confirmed",
      sensitivity: "professional",
      purposes: ["find_product_design_partner"],
      audiences: ["agent_beta"],
      valid_until: "2026-12-31T15:59:59.000Z",
      owner_signature: "owner-signature-alpha",
    },
  ],
  authorization_receipt: {
    schema_version: "authorization-receipt-0.2",
    receipt_id: "auth_alpha",
    owner_binding: "owner_verified_alpha",
    endpoint_id: "agent_alpha",
    claim_digest: `sha256:${"b".repeat(64)}`,
    purpose: "find_product_design_partner",
    recipient_endpoint_id: "agent_beta",
    scene: "professional_collaboration",
    consent_version: "consent-0.2",
    issued_at: "2026-09-14T08:00:00.000Z",
    expires_at: "2026-09-15T08:00:00.000Z",
    revoked: false,
    signature,
  },
};

export const validPayloads: HspPayloadByType = {
  CAPABILITY_OFFER: {
    scene: "professional_collaboration",
    purpose: "find_product_design_partner",
    answerable_predicates: ["skill.product_design"],
    non_disclosable_predicates: ["identity.government_id"],
    supported_evidence: ["owner_confirmed", "document_imported"],
    max_questions_per_round: 3,
  },
  QUESTION: {
    round: 1,
    questions: [
      {
        question_id: "q_design",
        predicate: "skill.product_design",
        prompt: "Can the owner lead product prototyping?",
        required: true,
      },
    ],
  },
  CLAIM_RESPONSE: {
    round: 1,
    in_reply_to: "msg_question",
    claim_envelope: validClaimEnvelope,
    unknown_question_ids: [],
    refusals: [],
    owner_required_question_ids: [],
    confidence: "high",
  },
  EVIDENCE_REQUEST: {
    round: 2,
    claim_ids: ["clm_design"],
    requested_evidence: "owner_confirmed",
    rationale: "This skill is a hard requirement.",
  },
  OWNER_REQUIRED: {
    request_id: "oreq_alpha",
    reason: "EXPAND_DISCLOSURE",
    questions: [
      {
        question_id: "q_company",
        predicate: "work.current_company",
        required: false,
      },
    ],
    requester_endpoint_id: "agent_beta",
    disclosure_recipient_endpoint_id: "agent_beta",
    requested_predicates: ["work.current_company"],
    retention_until: "2026-09-16T08:00:00.000Z",
  },
  CONFLICT_FOUND: {
    round: 2,
    conflicts: [
      {
        conflict_id: "conf_hours",
        constraint_id: "con_hours",
        claim_ids: ["clm_design"],
        kind: "HARD_CONSTRAINT",
        summary: "Available hours may be below the required minimum.",
        confirmed: false,
      },
    ],
    stop_recommendation: "NEED_OWNER",
  },
  PROPOSAL: {
    recommendation: "continue",
    evidence_claim_ids: ["clm_design"],
    conflict_ids: [],
    unknown_predicates: ["work.current_company"],
    summary: "The verified skills meet the current collaboration need.",
    stop_code: "SUCCESS_PROPOSAL",
  },
  OWNER_DECISION: {
    decision_id: "dec_alpha",
    decision: "continue",
    consent_version: "consent-0.2",
    decided_at: "2026-09-14T09:00:00.000Z",
    owner_signature: "owner-decision-signature",
  },
  REVEAL_RECEIPT: {
    reveal_id: "reveal_alpha",
    consent_version: "consent-0.2",
    revealed_items: [
      {
        field: "contact.wechat",
        digest: `sha256:${"c".repeat(64)}`,
        value: "wechat-id",
      },
    ],
    revealed_at: "2026-09-14T09:05:00.000Z",
    receipt_signature: signature,
  },
  TERMINATE: {
    stop_code: "OWNER_DECLINED",
    final_status: "NO_MATCH",
    summary: "The owners did not both consent to continue.",
    known_claim_ids: ["clm_design"],
    unknown_predicates: [],
    retryable: false,
    terminated_at: "2026-09-14T09:10:00.000Z",
  },
};

export function makeMessage<TType extends HspMessageType>(
  type: TType,
  payload: HspPayloadByType[TType],
): HspMessageOf<TType> {
  return {
    protocol: "hsp",
    protocol_version: HSP_PROTOCOL_VERSION,
    message_id: `msg_${type.toLowerCase()}`,
    handshake_id: "hs_alpha",
    community_id: "community_alpha",
    type,
    sender_endpoint_id: "agent_alpha",
    recipient_endpoint_id: "agent_beta",
    sequence: 1,
    state_version: 2,
    idempotency_key: `idem.${type.toLowerCase()}.0001`,
    nonce: "abcdefghijklmnop123456",
    issued_at: "2026-09-14T08:00:00.000Z",
    expires_at: "2026-09-15T08:00:00.000Z",
    expected_status: "SCREENING",
    payload,
    signature,
  };
}
