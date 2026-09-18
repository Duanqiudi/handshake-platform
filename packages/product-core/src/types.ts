export type IsoDateTime = string;
export type CalendarDate = string;

export const COMMUNITY_ID = "portfolio-builders" as const;
export const TEAMUP_PURPOSE = "seven_day_portfolio_teamup" as const;

export const AI_PROVIDERS = ["chatgpt", "kimi", "doubao", "other"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const CONNECTION_SOURCE_MODES = ["import", "mcp", "demo"] as const;
export type ConnectionSourceMode = (typeof CONNECTION_SOURCE_MODES)[number];

export const CONNECTION_CAPABILITIES = [
  "capsule_import",
  "interactive_tool",
  "background_callback",
] as const;
export type ConnectionCapability = (typeof CONNECTION_CAPABILITIES)[number];

export type ContactKind = "email" | "phone" | "wechat";

export interface OwnerContact {
  kind: ContactKind;
  value: string;
}

export interface Owner {
  id: string;
  communityId: string;
  displayName: string;
  contact: OwnerContact;
  status: "active" | "suspended" | "deleted";
  createdAt: IsoDateTime;
}

export interface AiConnection {
  id: string;
  ownerId: string;
  provider: AiProvider;
  label: string;
  sourceMode: ConnectionSourceMode;
  capabilities: readonly ConnectionCapability[];
  status: "active" | "disconnected";
  isDemo: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export const CAPSULE_FIELD_NAMES = [
  "goal",
  "offers",
  "seeks",
  "availability",
  "collaborationStyles",
  "projectInterests",
  "location",
  "languages",
] as const;
export type CapsuleFieldName = (typeof CAPSULE_FIELD_NAMES)[number];

export interface CapsuleFields {
  goal?: string;
  offers?: readonly string[];
  seeks?: readonly string[];
  availability?: string;
  collaborationStyles?: readonly string[];
  projectInterests?: readonly string[];
  location?: string;
  languages?: readonly string[];
}

export interface MemoryCapsule {
  id: string;
  ownerId: string;
  connectionId: string;
  sourceProvider: string;
  sourceMode: ConnectionSourceMode;
  status: "draft" | "published" | "revoked";
  purpose: typeof TEAMUP_PURPOSE;
  fields: CapsuleFields;
  approvedFields: readonly CapsuleFieldName[];
  privateCategories: readonly string[];
  expiresAt: IsoDateTime;
}

export interface ProjectAvailability {
  weeklyHours: number;
  timezone: string;
  slots: readonly string[];
}

export type LocationMode = "remote" | "hybrid" | "onsite";

export interface ProjectIntent {
  id: string;
  ownerId: string;
  communityId: string;
  capsuleId: string;
  startsOn: CalendarDate;
  title: string;
  goal: string;
  projectInterests: readonly string[];
  offers: readonly string[];
  seeks: readonly string[];
  availability: ProjectAvailability;
  minimumPartnerWeeklyHours?: number;
  collaborationStyles: readonly string[];
  locationMode: LocationMode;
  location?: string;
  requiredLanguages: readonly string[];
  status: "active" | "paused";
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
}

export interface MatchProfile {
  owner: Owner;
  connection: AiConnection;
  capsule: MemoryCapsule;
  intent: ProjectIntent;
}

export type CandidateRecommendation = "continue" | "needs_info" | "conflict";

export interface MatchExplanation {
  recommendation: CandidateRecommendation;
  reasons: readonly string[];
  gaps: readonly string[];
  conflicts: readonly string[];
  matchedOffers: readonly string[];
  matchedSeeks: readonly string[];
  scheduleCompatible: boolean;
}

export interface Candidate extends MatchExplanation {
  ownerId: string;
  displayName: string;
  provider: AiProvider;
  connectionMode: ConnectionSourceMode;
  capsule: MemoryCapsule;
}

export type ProductQuestionStatus = "pending" | "answered" | "declined" | "expired";

export interface ProductQuestion {
  id: string;
  handshakeId: string;
  fromOwnerId: string;
  toOwnerId: string;
  round: 1 | 2 | 3;
  prompt: string;
  requestedFields: readonly CapsuleFieldName[];
  required: boolean;
  purpose: typeof TEAMUP_PURPOSE;
  status: ProductQuestionStatus;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
}

export type ClaimValue = string | number | boolean | readonly string[];

export interface Claim {
  id: string;
  handshakeId: string;
  questionId: string;
  ownerId: string;
  recipientOwnerId: string;
  sourceConnectionId: string;
  predicate: CapsuleFieldName;
  value: ClaimValue;
  purpose: typeof TEAMUP_PURPOSE;
  approvedByOwner: true;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
}

export interface MatchRecommendation {
  ownerId: string;
  connectionId: string;
  recommendation: CandidateRecommendation;
  reasons: readonly string[];
  gaps: readonly string[];
  createdAt: IsoDateTime;
}

export type ConsentDecision = "continue" | "decline" | "needs_info";

export interface Consent {
  ownerId: string;
  decision: ConsentDecision;
  consentVersion: string;
  decidedAt: IsoDateTime;
}

export type OwnerDecision = Consent;

export interface CapsuleDisclosureSummary {
  ownerId: string;
  capsuleId: string;
  fields: CapsuleFields;
}

export interface ClaimDisclosureSummary {
  id: string;
  ownerId: string;
  recipientOwnerId: string;
  predicate: CapsuleFieldName;
  value: ClaimValue;
}

export interface RecommendationDisclosureSummary {
  ownerId: string;
  recommendation: CandidateRecommendation;
  reasons: readonly string[];
  gaps: readonly string[];
}

export interface HandshakeDisclosureContent {
  handshakeId: string;
  participantOwnerIds: readonly [string, string];
  capsules: readonly CapsuleDisclosureSummary[];
  claims: readonly ClaimDisclosureSummary[];
  recommendations: readonly RecommendationDisclosureSummary[];
}

export interface RevealedContact extends OwnerContact {
  ownerId: string;
}

export interface ContactReveal {
  revealedAt: IsoDateTime;
  contacts: readonly [RevealedContact, RevealedContact];
}

export const PRODUCT_HANDSHAKE_STATUSES = [
  "DRAFT",
  "READY",
  "DISCOVERING",
  "CANDIDATE_FOUND",
  "OWNER_AUTHORIZED",
  "SCREENING",
  "WAITING_OWNER",
  "CLARIFYING",
  "REJECTED",
  "PROPOSAL",
  "WAITING_DUAL_CONSENT",
  "NO_MATCH",
  "REVEALED",
  "INTRODUCED",
  "FEEDBACK_COMPLETE",
  "CANCELLED",
  "EXPIRED",
  "POLICY_BLOCKED",
  "FAILED",
  "DISPUTED",
] as const;
export type ProductHandshakeStatus = (typeof PRODUCT_HANDSHAKE_STATUSES)[number];

export interface ProductHandshake {
  id: string;
  communityId: string;
  participantOwnerIds: readonly [string, string];
  status: ProductHandshakeStatus;
  questions: readonly ProductQuestion[];
  claims: readonly Claim[];
  recommendations: readonly MatchRecommendation[];
  decisions: readonly Consent[];
  disclosureContent: HandshakeDisclosureContent;
  contactReveal: ContactReveal | null;
  projectId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type ReceiptKind = "capsule_publish" | "claim_disclosure" | "contact_reveal";

export interface PrivacyReceipt {
  id: string;
  ownerId: string;
  handshakeId: string | null;
  kind: ReceiptKind;
  purpose: typeof TEAMUP_PURPOSE;
  recipientOwnerId: string | null;
  subjectDigest: string;
  consentVersion: string | null;
  issuedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  revokedAt: IsoDateTime | null;
}

export type Receipt = PrivacyReceipt;

export interface ProjectPlanDay {
  day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  date: CalendarDate;
  title: string;
  objective: string;
  deliverables: readonly string[];
}

export interface ProjectCheckIn {
  id: string;
  ownerId: string;
  day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  summary: string;
  blockers: readonly string[];
  nextStep: string;
  createdAt: IsoDateTime;
}

export interface ProjectArtifact {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  createdAt: IsoDateTime;
}

export interface ProjectFeedback {
  id: string;
  ownerId: string;
  partnerOwnerId: string;
  summary: string;
  wouldCollaborateAgain: boolean;
  createdAt: IsoDateTime;
}

export interface PortfolioProject {
  id: string;
  handshakeId: string;
  participantOwnerIds: readonly [string, string];
  title: string;
  status: "active" | "completed" | "cancelled";
  startsAt: CalendarDate;
  endsAt: CalendarDate;
  plan: readonly ProjectPlanDay[];
  checkIns: readonly ProjectCheckIn[];
  artifacts: readonly ProjectArtifact[];
  feedback: readonly ProjectFeedback[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type Project = PortfolioProject;

export type ValidationIssueCode =
  | "invalid_type"
  | "missing_field"
  | "unknown_field"
  | "invalid_value"
  | "invalid_format"
  | "invariant_violation";

export interface ValidationIssue {
  path: string;
  code: ValidationIssueCode;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] };
