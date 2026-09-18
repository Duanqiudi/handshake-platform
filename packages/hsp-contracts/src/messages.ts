import type { ClaimSourceType, HandshakeStatus, HspMessageType, HspStopCode } from "./constants.js";
import type { ClaimEnvelope, DetachedSignature, IsoDateTime } from "./models.js";

export interface HspQuestion {
  readonly question_id: string;
  readonly predicate: string;
  readonly prompt?: string;
  readonly required: boolean;
}

export interface CapabilityOfferPayload {
  readonly scene: string;
  readonly purpose: string;
  readonly answerable_predicates: readonly string[];
  readonly non_disclosable_predicates: readonly string[];
  readonly supported_evidence: readonly ClaimSourceType[];
  readonly max_questions_per_round: number;
}

export interface QuestionPayload {
  readonly round: number;
  readonly questions: readonly HspQuestion[];
}

export interface ClaimResponsePayload {
  readonly round: number;
  readonly in_reply_to: string;
  readonly claim_envelope?: ClaimEnvelope;
  readonly unknown_question_ids: readonly string[];
  readonly refusals: readonly {
    readonly question_id: string;
    readonly code: "NOT_AUTHORIZED" | "OUT_OF_SCOPE" | "PROHIBITED" | "NO_EVIDENCE";
  }[];
  readonly owner_required_question_ids: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly stop_recommendation?: HspStopCode;
}

export interface EvidenceRequestPayload {
  readonly round: number;
  readonly claim_ids: readonly string[];
  readonly requested_evidence: "owner_confirmed" | "document_imported";
  readonly rationale: string;
}

export interface OwnerRequiredPayload {
  readonly request_id: string;
  readonly reason: "MISSING_FACT" | "EXPAND_DISCLOSURE" | "COMMITMENT" | "FACT_CONFLICT";
  readonly questions: readonly HspQuestion[];
  readonly requester_endpoint_id: string;
  readonly disclosure_recipient_endpoint_id: string;
  readonly requested_predicates: readonly string[];
  readonly retention_until: IsoDateTime;
}

export interface ConflictFoundPayload {
  readonly round: number;
  readonly conflicts: readonly {
    readonly conflict_id: string;
    readonly constraint_id: string;
    readonly claim_ids: readonly string[];
    readonly kind: "HARD_CONSTRAINT" | "CLAIM_CONTRADICTION";
    readonly summary: string;
    readonly confirmed: boolean;
  }[];
  readonly stop_recommendation: "HARD_CONFLICT" | "NEED_OWNER" | "LOW_CONFIDENCE";
}

interface ProposalPayloadFields {
  readonly evidence_claim_ids: readonly string[];
  readonly conflict_ids: readonly string[];
  readonly unknown_predicates: readonly string[];
  readonly summary: string;
}

/** SUCCESS_PROPOSAL and continue are a single semantic outcome, never independent flags. */
export type ProposalPayload = ProposalPayloadFields &
  (
    | {
        readonly recommendation: "continue";
        readonly stop_code: "SUCCESS_PROPOSAL";
      }
    | {
        readonly recommendation: "decline" | "owner_review";
        readonly stop_code: "ENOUGH_INFO" | "HUMAN_REQUIRED" | "LOW_CONFIDENCE";
      }
  );

export interface OwnerDecisionPayload {
  readonly decision_id: string;
  readonly decision: "continue" | "decline" | "clarify" | "terminate";
  readonly consent_version: string;
  readonly clarification?: string;
  readonly decided_at: IsoDateTime;
  readonly owner_signature: string;
}

export interface RevealReceiptPayload {
  readonly reveal_id: string;
  readonly consent_version: string;
  readonly revealed_items: readonly {
    readonly field: string;
    readonly digest: string;
    readonly value?: string;
  }[];
  readonly revealed_at: IsoDateTime;
  readonly receipt_signature: DetachedSignature;
}

export interface TerminatePayload {
  readonly stop_code: HspStopCode;
  readonly final_status:
    | "REJECTED"
    | "NO_MATCH"
    | "CANCELLED"
    | "EXPIRED"
    | "POLICY_BLOCKED"
    | "FAILED";
  readonly summary: string;
  readonly known_claim_ids: readonly string[];
  readonly unknown_predicates: readonly string[];
  readonly retryable: boolean;
  readonly terminated_at: IsoDateTime;
}

export interface HspPayloadByType {
  readonly CAPABILITY_OFFER: CapabilityOfferPayload;
  readonly QUESTION: QuestionPayload;
  readonly CLAIM_RESPONSE: ClaimResponsePayload;
  readonly EVIDENCE_REQUEST: EvidenceRequestPayload;
  readonly OWNER_REQUIRED: OwnerRequiredPayload;
  readonly CONFLICT_FOUND: ConflictFoundPayload;
  readonly PROPOSAL: ProposalPayload;
  readonly OWNER_DECISION: OwnerDecisionPayload;
  readonly REVEAL_RECEIPT: RevealReceiptPayload;
  readonly TERMINATE: TerminatePayload;
}

export interface HspEnvelopeMetadata<TType extends HspMessageType> {
  readonly protocol: "hsp";
  readonly protocol_version: string;
  readonly message_id: string;
  readonly handshake_id: string;
  readonly community_id: string;
  readonly type: TType;
  readonly sender_endpoint_id: string;
  readonly recipient_endpoint_id: string;
  readonly sequence: number;
  readonly state_version: number;
  readonly idempotency_key: string;
  readonly nonce: string;
  readonly issued_at: IsoDateTime;
  readonly expires_at: IsoDateTime;
  readonly expected_status?: HandshakeStatus;
  readonly signature: DetachedSignature;
}

export type HspMessageOf<TType extends HspMessageType> = HspEnvelopeMetadata<TType> & {
  readonly payload: HspPayloadByType[TType];
};

export type CapabilityOfferMessage = HspMessageOf<"CAPABILITY_OFFER">;
export type QuestionMessage = HspMessageOf<"QUESTION">;
export type ClaimResponseMessage = HspMessageOf<"CLAIM_RESPONSE">;
export type EvidenceRequestMessage = HspMessageOf<"EVIDENCE_REQUEST">;
export type OwnerRequiredMessage = HspMessageOf<"OWNER_REQUIRED">;
export type ConflictFoundMessage = HspMessageOf<"CONFLICT_FOUND">;
export type ProposalMessage = HspMessageOf<"PROPOSAL">;
export type OwnerDecisionMessage = HspMessageOf<"OWNER_DECISION">;
export type RevealReceiptMessage = HspMessageOf<"REVEAL_RECEIPT">;
export type TerminateMessage = HspMessageOf<"TERMINATE">;

export type HspMessage = {
  readonly [TType in HspMessageType]: HspMessageOf<TType>;
}[HspMessageType];
