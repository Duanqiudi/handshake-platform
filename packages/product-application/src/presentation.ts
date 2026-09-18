import {
  createConsentVersion,
  handshakeStatusLabel,
  type ProductHandshake,
} from "@handshake/product-core";
import { ProductError } from "./errors.js";
import type { ProductCommunitySnapshot, ProductHandshakeRecord } from "./store.js";
import type { HandshakeTimelineItem, HandshakeView } from "./types.js";

export function createHandshakeView(
  snapshot: ProductCommunitySnapshot,
  record: ProductHandshakeRecord,
  requesterOwnerId: string,
): HandshakeView {
  const handshake = record.product;
  assertParticipant(handshake, requesterOwnerId);
  const participants = handshake.participantOwnerIds.map((ownerId) => {
    const owner = snapshot.owners.find((item) => item.id === ownerId);
    const capsule = snapshot.capsules.find(
      (item) => item.ownerId === ownerId && item.status !== "revoked",
    );
    const connection =
      capsule === undefined
        ? snapshot.connections.find((item) => item.ownerId === ownerId && item.status === "active")
        : snapshot.connections.find((item) => item.id === capsule.connectionId);
    if (owner === undefined || connection === undefined) {
      throw new ProductError("INVALID_STATE", "Handshake participant profile is incomplete.", 500);
    }
    return {
      id: owner.id,
      displayName: owner.displayName,
      provider: connection.provider,
      connectionMode: connection.sourceMode,
      isCurrentOwner: owner.id === requesterOwnerId,
    };
  });
  const timeline = createTimeline(handshake);
  const roundsUsed = handshake.questions.reduce(
    (highestRound, question) => Math.max(highestRound, question.round),
    0,
  );
  return {
    id: handshake.id,
    status: handshake.status,
    statusLabel: handshakeStatusLabel(handshake.status),
    currentOwnerId: requesterOwnerId,
    participants,
    timeline,
    pendingQuestions: handshake.questions
      .filter(
        (question) => question.status === "pending" && question.toOwnerId === requesterOwnerId,
      )
      .map((question) => ({
        id: question.id,
        fromOwnerId: question.fromOwnerId,
        toOwnerId: question.toOwnerId,
        prompt: question.prompt,
        predicate: question.requestedFields[0] ?? null,
        round: question.round,
        required: question.required,
        expiresAt: question.expiresAt,
      })),
    roundsUsed,
    maxRounds: 3,
    recommendations: handshake.recommendations,
    decisions: handshake.decisions,
    consentVersion: createConsentVersion(handshake.disclosureContent),
    contactReveal: handshake.contactReveal,
    projectId: handshake.projectId,
  };
}

function createTimeline(handshake: ProductHandshake): HandshakeTimelineItem[] {
  const questions: HandshakeTimelineItem[] = handshake.questions.map((question) => ({
    id: question.id,
    kind: "question",
    ownerId: question.fromOwnerId,
    recipientOwnerId: question.toOwnerId,
    title: `第 ${question.round} 轮问题`,
    detail: question.prompt,
    createdAt: question.createdAt,
    status: question.status,
  }));
  const claims: HandshakeTimelineItem[] = handshake.claims.map((claim) => ({
    id: claim.id,
    kind: "claim",
    ownerId: claim.ownerId,
    recipientOwnerId: claim.recipientOwnerId,
    title: `已确认：${claim.predicate}`,
    detail: Array.isArray(claim.value) ? claim.value.join("、") : String(claim.value),
    createdAt: claim.createdAt,
    status: "owner_confirmed",
  }));
  const recommendations: HandshakeTimelineItem[] = handshake.recommendations.map(
    (recommendation) => ({
      id: `recommendation_${recommendation.ownerId}_${recommendation.createdAt}`,
      kind: "recommendation",
      ownerId: recommendation.ownerId,
      title:
        recommendation.recommendation === "continue"
          ? "AI 建议继续了解"
          : recommendation.recommendation === "needs_info"
            ? "AI 建议补充信息"
            : "AI 发现明确冲突",
      detail: [...recommendation.reasons, ...recommendation.gaps].join("；"),
      createdAt: recommendation.createdAt,
      status: recommendation.recommendation,
    }),
  );
  const decisions: HandshakeTimelineItem[] = handshake.decisions.map((decision) => ({
    id: `decision_${decision.ownerId}_${decision.decidedAt}`,
    kind: "decision",
    ownerId: decision.ownerId,
    title: "主人决定",
    detail:
      decision.decision === "continue"
        ? "同意继续并在双方同意后交换联系方式"
        : decision.decision === "decline"
          ? "本次不继续"
          : "需要补充信息",
    createdAt: decision.decidedAt,
    status: decision.decision,
  }));
  return [...questions, ...claims, ...recommendations, ...decisions].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function assertParticipant(handshake: ProductHandshake, ownerId: string): void {
  if (!handshake.participantOwnerIds.includes(ownerId)) {
    throw new ProductError("HANDSHAKE_NOT_FOUND", "Handshake was not found.", 404);
  }
}
