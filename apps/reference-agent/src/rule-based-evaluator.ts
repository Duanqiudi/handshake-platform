import type {
  CompatibilityAssessment,
  CompatibilityEvaluator,
  CompatibilityInput,
} from "./types.js";

/**
 * Deterministic baseline for the product experiment. It is intentionally not presented as AI.
 * A real model adapter will implement the same CompatibilityEvaluator interface later.
 */
export class RuleBasedCompatibilityEvaluator implements CompatibilityEvaluator {
  public readonly name = "rules-0.1";

  public evaluate(input: CompatibilityInput): CompatibilityAssessment {
    const selfOffers = normalizedSet(input.self.offers);
    const selfSeeks = normalizedSet(input.self.seeks);
    const candidateOffers = normalizedSet(input.candidate.offers);
    const candidateSeeks = normalizedSet(input.candidate.seeks);
    const selfHelpsCandidate = intersection(selfOffers, candidateSeeks);
    const candidateHelpsSelf = intersection(candidateOffers, selfSeeks);
    const matchingCapabilities = [...selfHelpsCandidate, ...candidateHelpsSelf].sort();
    const missingCapabilities = missingFields(input);

    if (
      selfHelpsCandidate.length > 0 &&
      candidateHelpsSelf.length > 0 &&
      missingCapabilities.length === 0
    ) {
      return {
        recommendation: "continue",
        stopCode: "SUCCESS_PROPOSAL",
        summary: `双方存在互补能力：${matchingCapabilities.join("、")}。建议由双方主人确认是否继续。`,
        matchingCapabilities,
        missingCapabilities,
      };
    }

    return {
      recommendation: "owner_review",
      stopCode: "HUMAN_REQUIRED",
      summary: "公开信息不足以形成可靠建议，需要主人补充或人工判断。",
      matchingCapabilities,
      missingCapabilities,
    };
  }
}

function normalizedSet(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function intersection(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value));
}

function missingFields(input: CompatibilityInput): string[] {
  const missing: string[] = [];
  if (!hasValues(input.self.offers) || !hasValues(input.self.seeks)) {
    missing.push("self.capabilities");
  }
  if (!hasValues(input.candidate.offers) || !hasValues(input.candidate.seeks)) {
    missing.push("candidate.capabilities");
  }
  return missing;
}

function hasValues(value: readonly string[] | undefined): boolean {
  return value !== undefined && value.length > 0;
}
