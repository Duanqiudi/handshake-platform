import { minimizeCapsule } from "./capsule.js";
import type { Candidate, MatchProfile } from "./types.js";

/**
 * Applies V1 hard constraints first, then reports concrete complementary evidence. It deliberately
 * returns categories and human-readable evidence instead of a made-up numerical score.
 */
export function matchCandidate(self: MatchProfile, other: MatchProfile): Candidate {
  const matchedOffers = intersection(self.intent.seeks, other.intent.offers);
  const matchedSeeks = intersection(self.intent.offers, other.intent.seeks);
  const sharedInterests = intersection(self.intent.projectInterests, other.intent.projectInterests);
  const sharedStyles = intersection(
    self.intent.collaborationStyles,
    other.intent.collaborationStyles,
  );
  const sharedSlots = compatibleSlots(
    self.intent.availability.slots,
    other.intent.availability.slots,
  );

  const reasons: string[] = [];
  const gaps: string[] = [];
  const conflicts: string[] = [];

  for (const skill of matchedOffers) {
    reasons.push(`你需要的 ${skill} 正是对方可提供的能力`);
  }
  for (const skill of matchedSeeks) {
    reasons.push(`你可以用 ${skill} 补足对方的需求`);
  }
  for (const interest of sharedInterests) {
    reasons.push(`双方都想做 ${interest} 方向的项目`);
  }
  if (sharedStyles.length > 0) {
    reasons.push(`双方都接受 ${sharedStyles.join("、")} 的协作方式`);
  } else {
    gaps.push("尚未确认双方偏好的协作方式是否兼容");
  }

  if (matchedOffers.length === 0) {
    gaps.push("尚未找到对方能够补足你需求的明确能力");
  }
  if (matchedSeeks.length === 0) {
    gaps.push("尚未找到你能够补足对方需求的明确能力");
  }
  if (sharedInterests.length === 0) {
    gaps.push("尚未确认共同的项目方向");
  }

  const hasDeclaredSlots =
    self.intent.availability.slots.length > 0 && other.intent.availability.slots.length > 0;
  const scheduleCompatible = hasDeclaredSlots && sharedSlots.length > 0;
  if (!hasDeclaredSlots) {
    gaps.push("尚未确认双方可共同投入的时间段");
  } else if (!scheduleCompatible) {
    conflicts.push("双方明确提供的可协作时间段没有重叠");
  } else {
    reasons.push(`双方可在 ${sharedSlots.join("、")} 协作`);
  }

  const selfMinimum = self.intent.minimumPartnerWeeklyHours;
  if (selfMinimum !== undefined && other.intent.availability.weeklyHours < selfMinimum) {
    conflicts.push(`对方每周投入少于你要求的 ${selfMinimum} 小时`);
  }
  const otherMinimum = other.intent.minimumPartnerWeeklyHours;
  if (otherMinimum !== undefined && self.intent.availability.weeklyHours < otherMinimum) {
    conflicts.push(`你每周投入少于对方要求的 ${otherMinimum} 小时`);
  }

  collectLocationConflicts(self, other, conflicts);
  collectLanguageConflicts(self, other, conflicts);

  const recommendation =
    conflicts.length > 0 ? "conflict" : gaps.length > 0 ? "needs_info" : "continue";

  return {
    ownerId: other.owner.id,
    displayName: other.owner.displayName,
    provider: other.connection.provider,
    connectionMode: other.connection.sourceMode,
    capsule: minimizeCapsule(other.capsule),
    recommendation,
    reasons,
    gaps,
    conflicts,
    matchedOffers,
    matchedSeeks,
    scheduleCompatible,
  };
}

function collectLocationConflicts(
  self: MatchProfile,
  other: MatchProfile,
  conflicts: string[],
): void {
  const selfRequiresPlace = self.intent.locationMode !== "remote";
  const otherRequiresPlace = other.intent.locationMode !== "remote";
  if (!selfRequiresPlace && !otherRequiresPlace) {
    return;
  }

  if (selfRequiresPlace !== otherRequiresPlace) {
    conflicts.push("一方要求线下协作，另一方仅接受远程协作");
    return;
  }

  if (
    self.intent.location !== undefined &&
    other.intent.location !== undefined &&
    normalize(self.intent.location) !== normalize(other.intent.location)
  ) {
    conflicts.push("双方均要求线下协作，但地点不同");
  }
}

function collectLanguageConflicts(
  self: MatchProfile,
  other: MatchProfile,
  conflicts: string[],
): void {
  const otherLanguages = other.capsule.fields.languages ?? [];
  const selfLanguages = self.capsule.fields.languages ?? [];
  const missingForSelf = difference(self.intent.requiredLanguages, otherLanguages);
  const missingForOther = difference(other.intent.requiredLanguages, selfLanguages);

  if (missingForSelf.length > 0) {
    conflicts.push(`对方不满足你要求的协作语言：${missingForSelf.join("、")}`);
  }
  if (missingForOther.length > 0) {
    conflicts.push(`你不满足对方要求的协作语言：${missingForOther.join("、")}`);
  }
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightValues = new Set(right.map(normalize));
  return [...new Map(left.map((value) => [normalize(value), value.trim()] as const)).entries()]
    .filter(([key]) => rightValues.has(key))
    .map(([, display]) => display)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function difference(required: readonly string[], offered: readonly string[]): string[] {
  const offeredValues = new Set(offered.map(normalize));
  return required.filter((value) => !offeredValues.has(normalize(value)));
}

function compatibleSlots(left: readonly string[], right: readonly string[]): string[] {
  const leftFlexible = left.some((value) => normalize(value) === "flexible");
  const rightFlexible = right.some((value) => normalize(value) === "flexible");
  if (leftFlexible && rightFlexible) return ["flexible"];
  if (leftFlexible) return right.map((value) => value.trim()).filter(Boolean);
  if (rightFlexible) return left.map((value) => value.trim()).filter(Boolean);
  return intersection(left, right);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}
