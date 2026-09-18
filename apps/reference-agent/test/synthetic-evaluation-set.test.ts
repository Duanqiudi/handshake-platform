import { validateHspMessage } from "@handshake/hsp-contracts";
import { describe, expect, it } from "vitest";
import {
  type LocalProfile,
  ReferenceAgent,
  RuleBasedCompatibilityEvaluator,
} from "../src/index.js";

const agent = new ReferenceAgent(new RuleBasedCompatibilityEvaluator());
const now = new Date("2026-09-15T12:00:00.000Z");

describe("first-scenario synthetic evaluation set", () => {
  it("keeps the policy boundary and HSP output stable across 20 synthetic profiles", () => {
    const results = Array.from({ length: 20 }, (_, index) => evaluateSyntheticPair(index));

    expect(
      results.filter(({ proposal }) => proposal.payload.recommendation === "continue"),
    ).toHaveLength(10);
    expect(
      results.filter(({ proposal }) => proposal.payload.recommendation === "owner_review"),
    ).toHaveLength(10);
    for (const { profile, proposal } of results) {
      expect(validateHspMessage(proposal)).toEqual({ ok: true, value: proposal });
      const serialized = JSON.stringify(proposal);
      expect(serialized).not.toContain(profile.privateMemory.rawNotes);
      expect(serialized).not.toContain(profile.privateMemory.contactDetails);
    }
  });
});

function evaluateSyntheticPair(index: number): {
  readonly profile: LocalProfile;
  readonly proposal: ReturnType<ReferenceAgent["createProposal"]>;
} {
  const capability = `capability_${index}`;
  const profile: LocalProfile = {
    schemaVersion: "reference-profile-0.1",
    endpointId: `agent_synthetic_${index}`,
    publicCapsule: {
      collaborationGoal: `synthetic collaboration goal ${index}`,
      offers: [capability],
      seeks: [`partner_capability_${index}`],
      availability: "6 hours per week",
    },
    privateMemory: {
      rawNotes: `private synthetic note ${index}`,
      contactDetails: `private-${index}@example.test`,
    },
    disclosurePolicy:
      index < 10
        ? { allowedFields: ["collaborationGoal", "offers", "seeks", "availability"] }
        : { allowedFields: ["collaborationGoal", "availability"] },
  };
  const proposal = agent.createProposal({
    profile,
    candidate: {
      collaborationGoal: `synthetic candidate goal ${index}`,
      offers: [`partner_capability_${index}`],
      seeks: [capability],
      availability: "6 hours per week",
    },
    communityId: "community_synthetic",
    handshakeId: `hs_synthetic_${index}`,
    recipientEndpointId: `agent_candidate_${index}`,
    sequence: 1,
    stateVersion: 5,
    now,
  });
  return { profile, proposal };
}
