/** Data intentionally allowed to leave the local Reference Agent in this experiment. */
export interface PublicCapsule {
  readonly collaborationGoal: string;
  readonly offers: readonly string[];
  readonly seeks: readonly string[];
  readonly availability: string;
}

/** Data that remains local; this type is deliberately never accepted by a model adapter. */
export interface PrivateMemory {
  readonly rawNotes: string;
  readonly contactDetails: string;
}

export const DISCLOSABLE_FIELDS = ["collaborationGoal", "offers", "seeks", "availability"] as const;

export type DisclosableField = (typeof DISCLOSABLE_FIELDS)[number];

export interface DisclosurePolicy {
  readonly allowedFields: readonly DisclosableField[];
}

export interface LocalProfile {
  readonly schemaVersion: "reference-profile-0.1";
  readonly endpointId: string;
  readonly publicCapsule: PublicCapsule;
  readonly privateMemory: PrivateMemory;
  readonly disclosurePolicy: DisclosurePolicy;
}

export type DisclosedCapsule = Readonly<Partial<PublicCapsule>>;

/** This is the only information a compatibility evaluator is allowed to receive. */
export interface CompatibilityInput {
  readonly self: DisclosedCapsule;
  readonly candidate: DisclosedCapsule;
}

interface CompatibilityAssessmentBase {
  readonly summary: string;
  readonly matchingCapabilities: readonly string[];
  readonly missingCapabilities: readonly string[];
}

export type CompatibilityAssessment = CompatibilityAssessmentBase &
  (
    | {
        readonly recommendation: "continue";
        readonly stopCode: "SUCCESS_PROPOSAL";
      }
    | {
        readonly recommendation: "owner_review";
        readonly stopCode: "HUMAN_REQUIRED";
      }
  );

export interface CompatibilityEvaluator {
  readonly name: string;
  evaluate(input: CompatibilityInput): CompatibilityAssessment;
}
