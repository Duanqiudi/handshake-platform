import type {
  AiConnection,
  AiProvider,
  Candidate,
  CapsuleFieldName,
  CapsuleFields,
  ConnectionSourceMode,
  MatchRecommendation,
  MemoryCapsule,
  Owner,
  PortfolioProject,
  PrivacyReceipt,
  ProductHandshakeStatus,
  ProjectIntent,
} from "@handshake/product-core";

export interface OnboardOwnerInput {
  readonly displayName: string;
  readonly contact: {
    readonly kind: "email" | "phone" | "wechat";
    readonly value: string;
  };
}

export interface OnboardOwnerResult {
  readonly owner: Owner;
  /** Displayed once. Only a SHA-256 digest is persisted. */
  readonly token: string;
}

export interface CreateConnectionInput {
  readonly provider: AiProvider | "manual" | "demo";
  readonly mode: ConnectionSourceMode | "manual_import";
  readonly label: string;
}

export interface UpdateConnectionInput {
  readonly label?: string;
  readonly status?: "active" | "disconnected";
}

export interface ImportCapsuleInput {
  readonly connectionId: string;
  readonly sourceProvider?: string;
  readonly sourceMode?: ConnectionSourceMode | "manual_import";
  readonly purpose?: "seven_day_portfolio_teamup";
  readonly fields: CapsuleFields;
  readonly approvedFields?: readonly CapsuleFieldName[];
  readonly expiresAt?: string;
}

export interface UpdateCapsuleInput {
  readonly fields?: CapsuleFields;
  readonly approvedFields?: readonly CapsuleFieldName[];
  readonly expiresAt?: string;
}

export interface CreateIntentInput {
  readonly capsuleId: string;
  readonly title: string;
  readonly summary: string;
  readonly desiredArtifact: string;
  readonly startsOn?: string;
  readonly weeklyHours?: number;
  readonly timezone?: string;
  readonly slots?: readonly string[];
  readonly minimumPartnerWeeklyHours?: number;
  readonly locationMode?: "remote" | "hybrid" | "onsite";
}

export interface StartHandshakeInput {
  readonly candidateOwnerId: string;
}

export interface AskQuestionInput {
  readonly toOwnerId: string;
  readonly predicate: string;
  readonly prompt: string;
  readonly required?: boolean;
}

export interface AnswerQuestionInput {
  readonly answer: string;
  readonly ownerConfirmed: true;
  readonly sourceType?: "owner_confirmed" | "ai_inferred";
  readonly confidence?: "high" | "medium" | "low";
  readonly expiresAt?: string;
}

export interface SubmitRecommendationInput {
  readonly recommendation: "continue" | "owner_review" | "needs_info" | "decline" | "conflict";
  readonly summary: string;
  readonly reasons?: readonly string[];
}

export interface SubmitDecisionInput {
  readonly decision: "continue" | "decline" | "more_info" | "needs_info";
  readonly consentVersion: string;
}

export interface AddCheckInInput {
  readonly day: number;
  readonly summary: string;
  readonly blocker?: string;
  readonly blockers?: readonly string[];
  readonly nextStep: string;
}

export interface AddArtifactInput {
  readonly title: string;
  readonly url: string;
}

export interface AddFeedbackInput {
  readonly completed?: boolean;
  readonly rating?: number;
  readonly wouldCollaborateAgain: boolean;
  readonly comment?: string;
  readonly summary?: string;
}

export interface PublicOwnerView {
  readonly id: string;
  readonly displayName: string;
}

export interface HandshakeParticipantView extends PublicOwnerView {
  readonly provider: AiProvider;
  readonly connectionMode: ConnectionSourceMode;
  readonly isCurrentOwner: boolean;
}

export interface HandshakeTimelineItem {
  readonly id: string;
  readonly kind: "question" | "claim" | "recommendation" | "decision" | "system";
  readonly ownerId?: string;
  readonly recipientOwnerId?: string;
  readonly title: string;
  readonly detail: string;
  readonly createdAt: string;
  readonly status?: string;
}

export interface HandshakeView {
  readonly id: string;
  readonly status: ProductHandshakeStatus;
  readonly statusLabel: string;
  readonly currentOwnerId: string;
  readonly participants: readonly HandshakeParticipantView[];
  readonly timeline: readonly HandshakeTimelineItem[];
  readonly pendingQuestions: readonly {
    readonly id: string;
    readonly fromOwnerId: string;
    readonly toOwnerId: string;
    readonly prompt: string;
    readonly predicate: CapsuleFieldName | null;
    readonly round: 1 | 2 | 3;
    readonly required: boolean;
    readonly expiresAt: string;
  }[];
  readonly roundsUsed: number;
  readonly maxRounds: 3;
  readonly recommendations: readonly MatchRecommendation[];
  readonly decisions: readonly {
    readonly ownerId: string;
    readonly decision: string;
    readonly consentVersion: string;
    readonly decidedAt: string;
  }[];
  readonly consentVersion: string;
  readonly contactReveal: null | {
    readonly revealedAt: string;
    readonly contacts: readonly {
      readonly ownerId: string;
      readonly kind: string;
      readonly value: string;
    }[];
  };
  readonly projectId: string | null;
}

export interface DashboardView {
  readonly owner: Owner;
  readonly connections: readonly AiConnection[];
  readonly capsules: readonly MemoryCapsule[];
  readonly intents: readonly ProjectIntent[];
  readonly candidates: readonly Candidate[];
  readonly handshakes: readonly HandshakeView[];
  readonly projects: readonly PortfolioProject[];
  readonly privacyReceipts: readonly PrivacyReceipt[];
}

export interface DemoBootstrapResult {
  readonly communityId: string;
  readonly owners: readonly {
    readonly owner: Owner;
    readonly token: string;
  }[];
}
