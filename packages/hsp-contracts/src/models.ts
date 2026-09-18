import type {
  ClaimConfidence,
  ClaimSourceType,
  HspMessageType,
  SensitivityLevel,
} from "./constants.js";

export type IsoDateTime = string;
export type EntityId = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface DetachedSignature {
  readonly algorithm: "Ed25519";
  readonly key_id: string;
  readonly value: string;
}

export interface OwnerBinding {
  readonly status: "verified" | "pending" | "suspended";
  readonly method?: "phone" | "wechat" | "email" | "manual";
  readonly verified_at?: IsoDateTime;
}

export interface AgentCapability {
  readonly message_types: readonly HspMessageType[];
  readonly claim_predicates: readonly string[];
  readonly features?: readonly (
    | "owner_handoff"
    | "evidence_request"
    | "dual_consent"
    | "contact_reveal"
  )[];
}

export interface AgentCard {
  readonly schema_version: "agent-card-0.2";
  readonly card_id: string;
  readonly endpoint_id: string;
  readonly community_ids: readonly string[];
  readonly owner_binding: OwnerBinding;
  readonly protocol_versions: readonly string[];
  readonly capabilities: AgentCapability;
  readonly scenes: readonly string[];
  readonly public_attributes?: Readonly<Record<string, JsonPrimitive>>;
  readonly online_status: "online" | "offline" | "degraded";
  readonly model?: {
    readonly provider: string;
    readonly model: string;
  };
  readonly memory_location?: "device" | "private_service" | "host_managed";
  readonly issued_at: IsoDateTime;
  readonly expires_at: IsoDateTime;
  readonly signature: DetachedSignature;
}

export interface IntentConstraint {
  readonly constraint_id: string;
  readonly predicate: string;
  readonly operator: "eq" | "neq" | "in" | "not_in" | "gte" | "lte" | "overlaps";
  readonly value: JsonPrimitive | readonly JsonPrimitive[] | ClaimRange;
}

export interface IntentCapsule {
  readonly schema_version: "intent-capsule-0.2";
  readonly intent_id: string;
  readonly endpoint_id: string;
  readonly community_id: string;
  readonly scene: string;
  readonly purpose: string;
  readonly mode: "seek" | "offer";
  readonly resources: readonly string[];
  readonly hard_constraints: readonly IntentConstraint[];
  readonly soft_preferences?: readonly IntentConstraint[];
  readonly availability?: {
    readonly commitment?: string;
    readonly starts_at?: IsoDateTime;
    readonly ends_at?: IsoDateTime;
  };
  readonly locations?: readonly string[];
  readonly languages?: readonly string[];
  readonly allowed_disclosures: readonly string[];
  readonly prohibited_disclosures: readonly string[];
  readonly status: "active" | "paused";
  readonly created_at: IsoDateTime;
  readonly expires_at: IsoDateTime;
  readonly signature: DetachedSignature;
}

export interface ClaimRange {
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  readonly include_min?: boolean;
  readonly include_max?: boolean;
}

export type ClaimValue = string | number | boolean | ClaimRange;

export interface Claim {
  readonly claim_id: string;
  readonly predicate: string;
  readonly value: ClaimValue;
  readonly source_type: ClaimSourceType;
  readonly source_ref?: string;
  readonly confidence: ClaimConfidence;
  readonly sensitivity: SensitivityLevel;
  readonly purposes: readonly string[];
  readonly audiences: readonly string[];
  readonly valid_until: IsoDateTime;
  readonly owner_signature?: string;
}

export interface AuthorizationReceipt {
  readonly schema_version: "authorization-receipt-0.2";
  readonly receipt_id: string;
  readonly owner_binding: string;
  readonly endpoint_id: string;
  readonly claim_digest: string;
  readonly purpose: string;
  readonly recipient_endpoint_id: string;
  readonly scene: string;
  readonly consent_version: string;
  readonly issued_at: IsoDateTime;
  readonly expires_at: IsoDateTime;
  readonly revoked: boolean;
  readonly revoked_at?: IsoDateTime;
  readonly signature: DetachedSignature;
}

export interface ClaimEnvelope {
  readonly schema_version: "claim-envelope-0.2";
  readonly envelope_id: string;
  readonly purpose: string;
  readonly scene: string;
  readonly recipient_endpoint_id: string;
  readonly claims: readonly Claim[];
  readonly authorization_receipt: AuthorizationReceipt;
}
