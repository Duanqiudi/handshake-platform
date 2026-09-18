import { HSP_PROTOCOL, HSP_PROTOCOL_VERSION, type ProposalMessage } from "@handshake/hsp-contracts";
import { discloseAllowedCapsule } from "./local-policy.js";
import type {
  CompatibilityAssessment,
  CompatibilityEvaluator,
  DisclosedCapsule,
  LocalProfile,
} from "./types.js";

export interface EvaluateCandidateInput {
  readonly profile: LocalProfile;
  readonly candidate: DisclosedCapsule;
}

export interface EvaluateCandidateResult {
  readonly evaluator: string;
  readonly disclosedCapsule: DisclosedCapsule;
  readonly assessment: CompatibilityAssessment;
}

export interface CreateProposalInput extends EvaluateCandidateInput {
  readonly communityId: string;
  readonly handshakeId: string;
  readonly recipientEndpointId: string;
  readonly sequence: number;
  readonly stateVersion: number;
  readonly now?: Date;
}

/** Local-only orchestration. It never accepts or returns PrivateMemory. */
export class ReferenceAgent {
  readonly #evaluator: CompatibilityEvaluator;

  public constructor(evaluator: CompatibilityEvaluator) {
    this.#evaluator = evaluator;
  }

  public evaluateCandidate(input: EvaluateCandidateInput): EvaluateCandidateResult {
    const disclosedCapsule = discloseAllowedCapsule(input.profile);
    return {
      evaluator: this.#evaluator.name,
      disclosedCapsule,
      assessment: this.#evaluator.evaluate({ self: disclosedCapsule, candidate: input.candidate }),
    };
  }

  public createProposal(input: CreateProposalInput): ProposalMessage {
    const result = this.evaluateCandidate(input);
    const issuedAt = input.now ?? new Date();
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const suffix = `${input.profile.endpointId}_${input.sequence}`.replace(/[^A-Za-z0-9_-]/g, "_");

    return {
      protocol: HSP_PROTOCOL,
      protocol_version: HSP_PROTOCOL_VERSION,
      message_id: `msg_proposal_${suffix}`,
      handshake_id: input.handshakeId,
      community_id: input.communityId,
      type: "PROPOSAL",
      sender_endpoint_id: input.profile.endpointId,
      recipient_endpoint_id: input.recipientEndpointId,
      sequence: input.sequence,
      state_version: input.stateVersion,
      idempotency_key: `proposal.${input.handshakeId}.${suffix}`,
      nonce: `nonce_${suffix}_reference_agent`,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      expected_status: "SCREENING",
      payload: proposalPayload(result.assessment),
      // Development placeholder only. Real signing is a later explicit security milestone.
      signature: {
        algorithm: "Ed25519",
        key_id: `key:${input.profile.endpointId}:dev`,
        value: "a".repeat(64),
      },
    };
  }
}

function proposalPayload(assessment: CompatibilityAssessment): ProposalMessage["payload"] {
  const shared = {
    evidence_claim_ids: [],
    conflict_ids: [],
    unknown_predicates: assessment.missingCapabilities,
    summary: assessment.summary,
  } as const;
  if (assessment.recommendation === "continue") {
    return { ...shared, recommendation: "continue", stop_code: "SUCCESS_PROPOSAL" };
  }
  return { ...shared, recommendation: "owner_review", stop_code: "HUMAN_REQUIRED" };
}
