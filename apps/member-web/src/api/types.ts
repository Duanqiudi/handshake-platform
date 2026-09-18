export type Provider = "chatgpt" | "kimi" | "doubao" | "other";
export type ConnectionMode = "mcp" | "capsule_import" | "demo";
export type Recommendation = "continue" | "needs_info" | "conflict";

export interface Owner {
  id: string;
  displayName: string;
  avatarSeed?: string | undefined;
  contactHint?: string | undefined;
  communityId?: string | undefined;
}

export interface AiConnection {
  id: string;
  provider: Provider;
  displayName: string;
  mode: ConnectionMode;
  status: "connected" | "attention" | "disconnected";
  capabilities: Array<"capsule_import" | "interactive_tool" | "background_callback">;
  lastActiveAt?: string | undefined;
  isSynthetic?: boolean | undefined;
}

export interface CapsuleFields {
  goal: string;
  offers: string[];
  seeks: string[];
  availability: string;
  collaborationStyles: string[];
  projectInterests: string[];
  location: string;
  languages: string[];
}

export type CapsuleFieldName = keyof CapsuleFields;

export interface MemoryCapsule {
  id: string;
  ownerId: string;
  connectionId: string;
  sourceProvider: Provider;
  sourceMode: "mcp" | "import" | "demo";
  status: "draft" | "published" | "revoked" | "expired";
  purpose: "seven_day_portfolio_teamup";
  fields: CapsuleFields;
  approvedFields: CapsuleFieldName[];
  privateCategories: string[];
  expiresAt: string;
  updatedAt?: string | undefined;
}

export interface ProjectIntent {
  id: string;
  capsuleId?: string | undefined;
  title: string;
  summary: string;
  desiredArtifact: string;
  startsOn?: string | undefined;
  status: "active" | "paused";
  createdAt?: string | undefined;
}

export interface Candidate {
  ownerId: string;
  displayName: string;
  provider: Provider;
  connectionMode: ConnectionMode;
  capsule: Partial<MemoryCapsule>;
  recommendation: Recommendation;
  reasons: string[];
  gaps: string[];
  matchedOffers: string[];
  scheduleCompatible: boolean;
  headline?: string | undefined;
  intentTitle?: string | undefined;
}

export interface TimelineItem {
  id: string;
  type: "created" | "question" | "answer" | "recommendation" | "decision" | "revealed";
  title: string;
  detail: string;
  actor?: string | undefined;
  createdAt: string;
  status?: string | undefined;
}

export interface ScreeningQuestion {
  id: string;
  prompt: string;
  purpose: string;
  round: number;
  askedBy: string;
  status: "pending" | "answered" | "declined";
  expiresAt?: string | undefined;
  answer?: string | undefined;
}

export interface MatchRecommendation {
  ownerId: string;
  recommendation: Recommendation;
  summary: string;
  reasons: string[];
  createdAt?: string | undefined;
}

export interface OwnerDecision {
  ownerId: string;
  decision: "continue" | "decline";
  consentVersion: string;
  decidedAt: string;
}

export interface ContactReveal {
  consentVersion: string;
  revealedAt: string;
  contacts: Array<{
    ownerId: string;
    displayName: string;
    channel: string;
    value: string;
  }>;
}

export interface HandshakeParticipant {
  ownerId: string;
  displayName: string;
  provider: Provider;
  isCurrentOwner?: boolean | undefined;
}

export interface HandshakeView {
  id: string;
  status:
    | "SCREENING"
    | "WAITING_OWNER"
    | "CLARIFYING"
    | "PROPOSAL"
    | "WAITING_DUAL_CONSENT"
    | "REVEALED"
    | "DECLINED"
    | "EXPIRED";
  statusLabel: string;
  participants: HandshakeParticipant[];
  timeline: TimelineItem[];
  pendingQuestions: ScreeningQuestion[];
  recommendations: MatchRecommendation[];
  decisions: OwnerDecision[];
  contactReveal: ContactReveal | null;
  projectId: string | null;
  disclosureSummary?:
    | {
        version: string;
        items: string[];
      }
    | undefined;
  roundsUsed?: number | undefined;
  maxRounds?: number | undefined;
}

export interface CheckIn {
  id: string;
  day: number;
  ownerId: string;
  summary: string;
  blocker?: string | undefined;
  nextStep?: string | undefined;
  createdAt: string;
}

export interface Artifact {
  id: string;
  title: string;
  url: string;
  note?: string | undefined;
  createdAt: string;
}

export interface ProjectFeedback {
  id: string;
  ownerId: string;
  rating: number;
  wouldCollaborateAgain: boolean;
  note: string;
  createdAt: string;
}

export interface PortfolioProject {
  id: string;
  handshakeId: string;
  title: string;
  status: "active" | "completed" | "archived";
  day: number;
  startsAt: string;
  endsAt: string;
  members: Array<{ ownerId: string; displayName: string; role: string }>;
  plan: Array<{ day: number; title: string; done: boolean }>;
  checkIns: CheckIn[];
  artifacts: Artifact[];
  feedback: ProjectFeedback[];
}

export interface PrivacyReceipt {
  id: string;
  type: "capsule_publish" | "claim_share" | "contact_reveal" | "project_feedback";
  title: string;
  purpose: string;
  recipient: string;
  fields: string[];
  status: "active" | "revoked" | "expired";
  createdAt: string;
  expiresAt?: string | undefined;
  revocable: boolean;
}

export interface DashboardData {
  owner: Owner;
  connections: AiConnection[];
  capsules: MemoryCapsule[];
  intents: ProjectIntent[];
  handshakes: HandshakeView[];
  projects: PortfolioProject[];
  receipts?: PrivacyReceipt[] | undefined;
}

export interface OnboardingResult {
  owner: Owner;
  token: string;
}

export interface DemoResetResult extends OnboardingResult {
  message?: string | undefined;
  demoOwners?: OnboardingResult[] | undefined;
}
